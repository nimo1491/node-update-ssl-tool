import 'babel-polyfill';
import fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import bmcHapi from 'node-bmc-hapi';
import chalk from 'chalk';
import blessed from 'blessed';
import yargs from 'yargs';
import ip from 'ip';

let conf, defCert, defCertkey;
let defProtocol, defAccount, defPassword, devices;
let certInfoArr = [];
let preparedToUpdate = [];

// blessed
let screen, header, devList, form, logger, certView;

// yargs: make options
let options = yargs
  .usage('Usage: $0 <command> [options]')
  .command('go', 'Start upload')
  .command('config', 'Read/Write config')
  .command('discover', 'Discover the devices')
  .demand(1)
  .help('h')
  .alias('h', 'help')
  .epilog('Copyright 2016 Compal')
  .argv;

let command = options._[0];
if (command === 'go') {
  options = yargs
  .reset()
  .usage('Usage: $0 go [options]')
  .option('i', {
    alias: 'interactive',
    describe: 'Get into interactive mode'
  })
  .option('p', {
    alias: 'pick',
    describe: 'Pick a config file',
    type: 'string',
    nargs: 1,
    default: 'conf.json'
  })
  .epilog('Copyright 2016 Compal')
  .argv;
  launchGo();
} else if (command === 'config') {
  options = yargs
  .reset()
  .usage('Usage: $0 config [options]')
  .option('r', {
    alias: 'read',
    describe: 'Read data from config file',
    type: 'array'
  })
  .option('w', {
    alias: 'write',
    describe: 'Write data to config file',
    type: 'array',
    nargs: 2
  })
  .option('a', {
    alias: 'assign',
    describe: 'Assign a parameter to the device',
    type: 'array',
    nargs: 2
  })
  .implies('a', 'w')
  .option('p', {
    alias: 'pick',
    describe: 'Pick a config file',
    type: 'string',
    nargs: 1,
    default: 'conf.json'
  })
  .epilog('Copyright 2016 Compal')
  .argv;
  launchConfig();
} else if (command === 'discover') {
  options = yargs
  .reset()
  .usage('Usage: $0 discover [options]')
  .option('t', {
    alias: 'title',
    describe: 'Discover the devices by the given title',
    type: 'string',
    nargs: 1,
    default: 'Compal'
  })
  .option('b', {
    alias: 'begin',
    describe: 'Beginning IP address',
    type: 'string',
    nargs: 1
  })
  .option('e', {
    alias: 'end',
    describe: 'Endign IP address',
    type: 'string',
    nargs: 1
  })
  .demand(['b', 'e'])
  .option('p', {
    alias: 'pick',
    describe: 'Pick a config file',
    type: 'string',
    nargs: 1,
    default: 'conf.json'
  })
  .epilog('Copyright 2016 Compal')
  .argv;
  launchDiscover();
} else {
  yargs.showHelp();
  console.log('Invalid command');
}
console.log(options);

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
          preparedToUpdate.push(prop);
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


function fillDefaultSettings(file = 'conf.json') {

  try {
    conf = JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf-8'));
  } catch (err) {
    console.log(chalk.black.bgRed(err));
    console.log(chalk.black.bgRed('Please make sure all needed files are ready.'));
    process.exit(0);
  }

  defProtocol = conf.protocol || 'https';
  defAccount  = conf.account  || 'admin';
  defPassword = conf.password || 'admin';
  defCert     = __dirname + conf.cert || __dirname + '/web-cert.pem';
  defCertkey  = __dirname + conf.certkey  || __dirname + '/web-certkey.pem';
  devices     = conf.devices;

  devices.forEach((dev) => {
    if (dev.preparedToUpdate)
      preparedToUpdate.push(dev.ip);
  });
}

function createCheckbox(topValue, ip) {

  let checkbox = blessed.checkbox({
    parent: form,
    mouse: true,
    keys: true,
    shrink: true,
    checked: false,
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

async function fetchSsl(protocol, ip, account, password, index, cb) {

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

  } catch (err) {
    logger.log(chalk.black.bgRed(err));
  }

  logger.log(ip + ': Get SSL done');
  cb();
};

function startUpload() {

  devices.forEach((dev) => {

    let protocol = defProtocol || dev.protocol;
    let account = defAccount || dev.account;
    let password = defPassword || dev.password;

    if (preparedToUpdate.indexOf(dev.ip) >= 0) {
      uploadSsl(protocol, dev.ip, account, password, defCert, defCertkey);
    }
  });
}

async function uploadSsl(protocol, ip, account, password, cert, key) {

  if (options.i)
    console = logger;

  try {
    console.log(chalk.blue('Starting update SSL to ') + chalk.yellow.bold(ip));

    // Login
    let {cc, cookie, token} = await bmcHapi.login(protocol, ip, account, password);
    if (cc != 0)
      console.log(chalk.red('Login: ' + cc + ', ' + cookie + ', ' + token));

    // Upload SSL Cert
    cc = await bmcHapi.uploadSslCert(protocol, ip, cookie, token, cert);
    if (cc != 200)
      console.log(chalk.red('Upload SSL Cert: ' + cc));

    // Upload SSL Key
    cc = await bmcHapi.uploadSslKey(protocol, ip, cookie, token, key);
    if (cc != 200)
      console.log(chalk.red('Upload SSL Key: ' + cc));

    // Validate SSL
    cc = await bmcHapi.validateSsl(protocol, ip, cookie, token);
    if (cc != 200)
      console.log(chalk.red('Validate SSL: ' + cc));

    // Restart HTTPS and logout
    cc = await bmcHapi.restartHttps(protocol, ip, cookie, token);
    if (cc != 200)
      console.log(chalk.red('Restart HTTPS: ' + cc));

    console.log(chalk.blue('Successfully updating SSL to ') + chalk.yellow.bold(ip));

  } catch (err) {
    console.log(chalk.bgRed(err));
  }
};

function launchGo() {

  options.p ? fillDefaultSettings(options.p) : fillDefaultSettings();

  if (options.i) {

    makeUi();
    let i = 0;

    const promises = devices.map((dev) => {
      return new Promise((resolve, reject) => {

        let protocol = defProtocol || dev.protocol;
        let account = defAccount || dev.account;
        let password = defPassword || dev.password;

        fetchSsl(protocol, dev.ip, account, password, i, () => {

          // Fill in the list
          devList.addItem(dev.ip);
          screen.render();

          // Fill in the checkbox
          let checkbox = createCheckbox(i, dev.ip);
          if (dev.preparedToUpdate)
            checkbox.checked = true;
          screen.render();

          i++;
          resolve();
        });
      });
    });

    Promise.all(promises).then(() => {

      let submit = createSubmitButton(++i);
      screen.render();

      devList.select(0);

      submit.on('press', () => {
        form.submit();
      });
      logger.log(chalk.green('Get all SSL Certificate Info done.'));

    });
  }
  else {
    startUpload();
  }
}

function launchConfig() {

  let conf = options.p;

  if (options.r !== undefined) {
    readConfigParam(conf, options.r);
  }

  if (options.w !== undefined) {
    console.log(options);
    writeConfigParam(conf, options.w, options.a);
  }
}

function launchDiscover() {

  let conf = options.p, title = options.t;

  if (ip.isV4Format(options.b) && ip.isV4Format(options.e))
    startDiscover(conf, title, options.b, options.e);
}

function startDiscover(conf, title, beginIp, endIp) {

  let configData, isFileExisted;
  let ipList = new Array();
  let realIpList = new Array();

  try {
    fs.statSync(path.resolve(__dirname, conf));
    isFileExisted = true;
  } catch(e) {
    isFileExisted = false;
  }

  if (isFileExisted)
    configData = JSON.parse(fs.readFileSync(path.resolve(__dirname, conf), 'utf-8'));
  else
    configData = new Object();

  let beginIpNum = ip.toLong(beginIp);
  let endIpNum = ip.toLong(endIp);

  for (let i = beginIpNum; i <= endIpNum; i++)
    ipList.push(ip.fromLong(i));

  console.log('Start discovering BMC from ' + beginIp + ' to ' + endIp);
  console.log('Please wait....');
  const promises = ipList.map((ipAddr) => {
    return new Promise((resolve, reject) => {
      detectBmc('https', ipAddr, title, (err, isDev) => {
        if (err)
          resolve();
        if (isDev) {
          realIpList.push(ipAddr);
        }
        resolve();
      });
    });
  });

  Promise.all(promises).then(() => {
    console.log(chalk.green('Discover done'));
    console.log(chalk.magenta('Got ' + realIpList.length + ' devices'));
    realIpList.forEach((dev) => {
      console.log(chalk.magenta(dev));
      writeConfigParam(conf, ['devices', dev]);
    });
  });
}

function detectBmc(protocol, ipAddr, title, cb) {

  bmcHapi.detectDev('https', ipAddr, title).then((args) => {
    let {cc, isDev} = args
    cb(null, isDev);
  }).catch((err) => {
    cb(err);
  });
}

function writeConfigParam(configFile, keys, assigned) {

  let configData, isFileExisted;

  try {
    fs.statSync(path.resolve(__dirname, configFile));
    isFileExisted = true;
  } catch(e) {
    isFileExisted = false;
  }

  if (isFileExisted)
    configData = JSON.parse(fs.readFileSync(path.resolve(__dirname, configFile), 'utf-8'));
  else
    configData = new Object();

  console.log(configData);
  if (keys[0] === 'devices') {

    let newDev = {
      ip: keys[1],
      preparedToUpdate: true
    }

    if (ip.isV4Format(keys[1])) {
      if (configData.hasOwnProperty('devices')) {
        let selectedDevIndex = configData.devices.findIndex((dev) => {
          return dev.ip === keys[1];
        });
        if (selectedDevIndex < 0) {       // add a device
          if (assigned !== undefined)
            newDev[assigned[0]] = assigned[1];
          configData.devices.push(newDev);
        } else {                          // modify the device
          if (assigned !== undefined) {
            let toBeModified = configData.devices[selectedDevIndex];
            toBeModified[assigned[0]] = assigned[1];
            configData.devices[selectedDevIndex] = toBeModified;
          } else {
            console.log(chalk.cyan('The device already existed'));
          }
        }
      } else {                            // add first device
        configData.devices = new Array();
        if (assigned !== undefined)
          newDev[assigned[0]] = assigned[1];
        configData.devices.push(newDev);
      }
    }
  } else {
    configData[keys[0]] = keys[1];
  }
  console.log(configData);

  // Overwrite the file
  try {
    fs.writeFileSync(path.resolve(__dirname, configFile), JSON.stringify(configData, null, 2));
  } catch(e) {
    console.log(chalk.red('Got something wrong when writing the file'));
  }
}

function readConfigParam(confFile, keys) {

  let configData;

  try {
    configData = JSON.parse(fs.readFileSync(path.resolve(__dirname, confFile), 'utf-8'));
  } catch(e) {
    console.log(chalk.red('Cannot find the config file'));
  }

  if (keys.length === 0)
    keys.push('all')

  keys.forEach((key) => {
    if (key === 'all') {
      for (let prop in configData) {
        if (configData.hasOwnProperty(prop))
          console.log(chalk.magenta(prop + ': ') + chalk.cyan(inspect(configData[prop])));
      }
    } else if (ip.isV4Format(key)) {
      if (configData.hasOwnProperty('devices')) {
        let dev = configData.devices.find((dev) => {
          return dev.ip == key;
        });
        console.log(chalk.magenta(key + ': ') + chalk.cyan(inspect(dev)));
      }
    } else {
      for (let prop in configData) {
        if (configData.hasOwnProperty(prop) && prop === key)
          console.log(chalk.magenta(prop + ': ') + chalk.cyan(inspect(configData[prop])));
      }
    }
  });
}
