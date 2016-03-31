import 'babel-polyfill';
import fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import bmcHapi from 'node-bmc-hapi';
import chalk from 'chalk';
import blessed from 'blessed';

let conf, defCert, defKey;
let defProtocol, defAccount, defPassword, devices;
let certInfoArr = [];
let prerparedToUpdate = [];

// blessed
let screen, header, devList, form, logger, certView;

function makeUi() {
  screen = blessed.screen({
    smartCSR: true,
    title: 'update SSL Tool',
    warning: true
  });

  header = blessed.text({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    align: 'center',
    content: '{black-fg}Compal Update SSL Tool{black-fg} {green-fg}(Press "q", "ESC", or "Ctrl-c" to exit){green-fg}',
    style: {
      bg: '#0000ff'
    },
    tags: true
  });

  devList = blessed.list({
    parent: screen,
    align: 'center',
    mouse: true,
    label: 'BMC List',
    border: 'line',
    style: {
      fg: 'blue',
      bg: 'default',
      border: {
        fg: 'default',
        bg: 'default'
      },
      selected: {
        fg: 'black',
        bg: 'green'
      }
    },
    width: '40%',
    height: '45%',
    top: 2,
    left: 'left',
    tags: true,
    invertSelected: false,
    scrollbar: {
      ch: ' ',
      track: {
        bg: 'yellow'
      },
      style: {
        inverse: true
      }
    }
  })

  devList.on('keypress', (ch, key) => {

    if (key.name === 'up' || key.name === 'k') {
      devList.up();
      let certInfo = certInfoArr.find((cert) => {
        return cert.ip === devList.ritems[devList.selected];
      });
      if (certView !== undefined)
        certView.setContent(inspect(certInfo));
      screen.render();
      return;
    }
    else if (key.name === 'down' || key.name === 'j') {
      devList.down();
      let certInfo = certInfoArr.find((cert) => {
        return cert.ip === devList.ritems[devList.selected];
      });
      if (certView !== undefined)
        certView.setContent(inspect(certInfo));
      screen.render();
      return;
    }
  });

  devList.on('select', (item, selected) => {
    let certInfo = certInfoArr.find((cert) => {
      return cert.ip === item.getText();
    });
    if (certView !== undefined)
      certView.setContent(inspect(certInfo));
    screen.render();
  });

  certView = blessed.box({
    parent: screen,
    top: 2,
    right: 0,
    width: '60%',
    height: '45%',
    tags: true,
    label: 'Current Cert Info',
    keys: true,
    mouse: true,
    border: 'line',
    style: {
      fg: 'cyan',
      bg: 'default',
      border: {
        fg: 'default',
        bg: 'default'
      },
    },
    scrollable: true,
    scrollback: 100,
    scrollbar: {
      ch: ' ',
      track: {
        bg: 'yellow'
      },
      style: {
        inverse: true
      }
    }
  });

  form = blessed.form({
    parent: screen,
    mouse: true,
    keys: true,
    label: 'Device needs to be updated',
    border: 'line',
    left: 0,
    bottom: 2,
    width: '40%',
    height: '45%',
    style: {
      fg: 'blue',
      bg: 'default',
      border: {
        fg: 'default',
        bg: 'default'
      },
      scrollbar: {
        inverse: true
      }
    },
    scrollable: true,
    scrollbar: {
      ch: ' '
    }
  });

  form.on('submit', (data) => {

    // Fill in preparedToUpdate
    for (let prop in data) {
      if (data.hasOwnProperty(prop)) {
        if (prop == 'Submit')
          continue;
        if (data[prop])
          prerparedToUpdate.push(prop);
      }
    }
    screen.render();

    // Start to update
    startUpload();
  });

  logger = blessed.log({
    parent: screen,
    bottom: 2,
    right: 0,
    width: '60%',
    height: '45%',
    border: 'line',
    tags: true,
    keys: true,
    mouse: true,
    label: 'Console',
    style: {
      fg: 'magenta',
      bg: 'default',
      border: {
        fg: 'default',
        bg: 'default'
      },
      scrollbar: {
        inverse: true
      }
    },
    scrollback: 100,
    scrollbar: {
      ch: ' ',
      track: {
        bg: 'yellow'
      },
      style: {
        inverse: true
      }
    }
  });

  screen.key(['escape', 'q', 'C-c'], (ch, key) => {
    return process.exit(0);
  });

  devList.focus();
  screen.render();
}


function fillDefaultSettings() {

  try {
    conf = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'conf.json'), 'utf-8'));
    defCert = __dirname + '/web-cert.pem';
    defKey = __dirname + '/web-certkey.pem';
  } catch (err) {
    logger.log(chalk.black.bgRed(err));
    logger.log(chalk.black.bgRed.bold('Please make sure all needed files are ready.'));
    process.exit(0);
  }

  defProtocol = conf.protocol || 'https';
  defAccount = conf.account || 'admin';
  defPassword = conf.password || 'admin';
  devices = conf.devices;
}

function createCheckbox(topValue, ip) {

  let checkbox = blessed.checkbox({
    parent: form,
    mouse: true,
    keys: true,
    shrink: true,
    checked: true,
    style: {
      bg: 'default',
      fg: 'blue'
    },
    height: 2,
    left: 0,
    top: topValue,
    name: ip,
    content: ip
  });

  return checkbox;
}

function createSubmitButton(topValue) {

  let submit = blessed.button({
    parent: form,
    mouse: true,
    keys: true,
    shrink: true,
    padding: {
      left: 1,
      right: 1
    },
    style: {
      bg: 'blue',
      fg: 'black',
      focus: {
        bg: 'red',
        fg: 'white'
      }
    },
    height: 1,
    left: 0,
    top: topValue,
    name: 'Submit',
    content: 'Submit'
  });

  return submit;
}

async function fetchSsl(protocol, ip, account, password, index) {

  logger.log(ip + ': Get SSL');
  try {
    // Login
    let {cc, cookie, token} = await bmcHapi.login(protocol, ip, account, password);
    if (cc != 0)
      logger.log(chalk.red('Login: ' + cc + ', ' + cookie + ', ' + token));

    // Get SSL Cert
    let certRes;
    certRes = await bmcHapi.getSslCert(protocol, ip, cookie, token);
    if (certRes.cc != 0) {
      logger.log(chalk.red('Get SSL Cert: ' + certRes.cc));
    }
    else {
      certRes.certInfo.ip = ip;
      certInfoArr.push(certRes.certInfo);
    }

    // Show the first device in the conf file
    if (index == 0) {
      let certInfo = certInfoArr.find((cert) => {
        return cert.ip == ip;
      });
      certView.setContent(inspect(certInfo));
    }

    // Logout
    cc = await bmcHapi.logout(protocol, ip, cookie, token);
    if (cc != 0)
      logger.log(chalk.red('Logout: ' + cc));

  logger.log(ip + ': Get SSL done');

  } catch (err) {
    logger.log(chalk.black.bgRed(err));
  }
};

function startUpload() {

  devices.forEach((dev) => {

    let protocol = defProtocol || dev.protocol;
    let account = defAccount || dev.account;
    let password = defPassword || dev.password;

    if (prerparedToUpdate.indexOf(dev.ip) >= 0)
      uploadSsl(protocol, dev.ip, account, password, defCert, defKey);
  });
}

async function uploadSsl(protocol, ip, account, password, cert, key) {

  try {
    logger.log(chalk.blue('Starting update SSL to ') + chalk.yellow.bold(ip));

    // Login
    let {cc, cookie, token} = await bmcHapi.login(protocol, ip, account, password);
    if (cc != 0)
      logger.log(chalk.red('Login: ' + cc + ', ' + cookie + ', ' + token));

    // Upload SSL Cert
    cc = await bmcHapi.uploadSslCert(protocol, ip, cookie, token, cert);
    if (cc != 200)
      logger.log(chalk.red('Upload SSL Cert: ' + cc));

    // Upload SSL Key
    cc = await bmcHapi.uploadSslKey(protocol, ip, cookie, token, key);
    if (cc != 200)
      logger.log(chalk.red('Upload SSL Key: ' + cc));

    // Validate SSL
    cc = await bmcHapi.validateSsl(protocol, ip, cookie, token);
    if (cc != 200)
      logger.log(chalk.red('Validate SSL: ' + cc));

    // Restart HTTPS and logout
    cc = await bmcHapi.restartHttps(protocol, ip, cookie, token);
    if (cc != 200)
      logger.log(chalk.red('Restart HTTPS: ' + cc));

    logger.log(chalk.blue('Successfully updating SSL to ') + chalk.yellow.bold(ip));

  } catch (err) {
    logger.log(chalk.bgRed(err));
  }
};

(function go() {

  fillDefaultSettings();
  makeUi();

  let i = 0;

  devices.forEach((dev) => {

    // Fill in the list
    devList.addItem(dev.ip);
    screen.render();

    // Fill in the checkbox
    createCheckbox(i, dev.ip);
    screen.render();

    let protocol = defProtocol || dev.protocol;
    let account = defAccount || dev.account;
    let password = defPassword || dev.password;

    fetchSsl(protocol, dev.ip, account, password, i);
    i++;
  });

  devList.select(0);

  let submit = createSubmitButton(++i);
  screen.render();

  submit.on('press', () => {
    form.submit();
  });

}());
