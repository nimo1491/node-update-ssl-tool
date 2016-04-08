import 'babel-polyfill';
import fs from 'fs';
import { inspect } from 'util';
import chalk from 'chalk';
import blessed from 'blessed';
import yargs from 'yargs';
import ip from 'ip';
import { readConfig, writeConfig } from './Config';
import { fetchSsl, uploadSsl } from './HapiBundle';
import discover from './discover';

let conf;
let defCert;
let defCertkey;
let defProtocol;
let defAccount;
let defPassword;
let devices;
const certInfoArr = [];
const preparedToUpdate = [];

// blessed
let screen;
let devList;
let form;
let logger;
let certView;

/** Supported parameters
 *  For read, user can direct give an IP to get the infomation of the specific device.
 *  For write, user have to use "devices" to access a specific.
 *  For example:
 *    $0 config -r 192.168.0.100            // Read the info of 192.168.0.100
 *    $0 config -w 192.168.0.100            // Wrong
 *    $0 config -w devices 192.168.0.100    // Correct, should use "devices" as parameter
*/
const supportedReadParam = ['all', 'cert', 'key', 'protocol', 'account', 'password', 'devices'];
const supportedWriteParam = ['cert', 'key', 'protocol', 'account', 'password', 'devices'];

// yargs: make options
let options = yargs
  .usage('Usage: $0 <command> [options]')
  .command('discover', 'Discover the devices')
  .command('config', 'Read/Write config')
  .command('go', 'Start upload')
  .demand(1)
  .help('h')
  .alias('h', 'help')
  .epilog('Copyright 2016 Compal')
  .argv;

const command = options._[0];
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
  .example('$0 go', 'Read default config file and update immediately')
  .example('$0 go -i', 'Go to interactive mode')
  .example('$0 go -p my.json', 'Pick my.json as your config file')
  .example('$0 go -p my.json -i',
           'Pick my.json as your config file and open nteractive mode')
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
  .example('$0 config', 'Dump default config file')
  .example('$0 config -r devices',
           'Dump devices property from default config file')
  .example('$0 config -r protocol cert',
           'Dump multiple properties')
  .example('$0 config -r protocol -p my.json',
           'Dump protocol property from my.json')
  .example('$0 config -w protocol http',
           'Set protocol to http and save it in the default config file')
  .example('$0 config -r -w password myPassword',
           'Set password to myPassword and then dump the default config file')
  .example('$0 config -w devices 192.168.0.100 -p my.json',
           'Add 192.168.0.100 and save it in my.json')
  .example('$0 config -w devices 192.168.0.110 -a account myAccount',
           'Add 192.168.0.110 with default account property')
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
  .example('$0 discover -b 192.168.0.0 -e 192.168.0.200',
           'Discover from 192.168.0.0 to 192.168.0.200 by the default HTML title' +
           ' and save the result in the default config file')
  .example('$0 discover -b 192.168.0.0 -e 192.168.0.200 -t MyServer -p my.json',
           'Discover from 192.168.0.0 to 192.168.0.200 by MyServer' +
           ' and save the result in the my.json')
  .epilog('Copyright 2016 Compal')
  .argv;

  launchDiscover();
} else {
  yargs.showHelp();
  console.log('Invalid command');
}

function makeUi() {
  screen = blessed.screen({
    smartCSR: true,
    title: 'update SSL Tool',
    warning: true
  });

  blessed.text({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    align: 'center',
    content: '{black-fg}Compal Update SSL Tool{black-fg} ' +
             '{green-fg}(Press "q", "ESC", or "Ctrl-c" to exit){green-fg}',
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
  });

  devList.on('keypress', (ch, key) => {
    if (key.name === 'up' || key.name === 'k') {
      devList.up();
      const certInfo = certInfoArr.find(cert => cert.ip === devList.ritems[devList.selected]);
      if (certView !== undefined) {
        certView.setContent(inspect(certInfo));
      }
      screen.render();
      return;
    } else if (key.name === 'down' || key.name === 'j') {
      devList.down();
      const certInfo = certInfoArr.find(cert => cert.ip === devList.ritems[devList.selected]);
      if (certView !== undefined) {
        certView.setContent(inspect(certInfo));
      }
      screen.render();
      return;
    }
  });

  devList.on('select', (item) => {
    const certInfo = certInfoArr.find(cert => cert.ip === item.getText());
    if (certView !== undefined) {
      certView.setContent(inspect(certInfo));
    }
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
    for (const prop in data) {
      if (data.hasOwnProperty(prop)) {
        if (prop === 'Submit') continue;
        if (data[prop]) {
          preparedToUpdate.push(prop);
        }
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

  screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

  devList.focus();
  screen.render();
}


function fillDefaultSettings(file = 'conf.json') {
  // Make sure the config file is existed
  try {
    conf = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.log(chalk.black.bgRed(err));
    console.log(chalk.black.bgRed('Please make sure all needed files are ready.'));
    process.exit(0);
  }

  defProtocol = conf.protocol || 'https';
  defAccount = conf.account || 'admin';
  defPassword = conf.password || 'admin';
  devices = conf.devices;

  if (conf.cert === undefined) {
    defCert = './web-cert.pem';
  } else {
    defCert = `./${conf.cert}`;
  }

  if (conf.certkey === undefined) {
    defCertkey = './web-certkey.pem';
  } else {
    defCertkey = `./${conf.certkey}`;
  }

  // make sure cert and its key are ready
  try {
    fs.statSync(defCert);
    fs.statSync(defCertkey);
  } catch (err) {
    console.log(chalk.black.bgRed(err));
    console.log(chalk.black.bgRed('Please make sure all needed files are ready.'));
    process.exit(0);
  }

  devices.forEach((dev) => {
    if (dev.preparedToUpdate === true) {
      preparedToUpdate.push(dev.ip);
    }
  });
}

function createCheckbox(topValue, ipAddr) {
  const checkbox = blessed.checkbox({
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
    name: ipAddr,
    content: ipAddr
  });

  return checkbox;
}

function createSubmitButton(topValue) {
  const submit = blessed.button({
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

function startUpload() {
  devices.forEach((dev) => {
    const protocol = dev.protocol || defProtocol;
    const account = dev.account || defAccount;
    const password = dev.password || defPassword;

    if (preparedToUpdate.indexOf(dev.ip) >= 0) {
      let overwriteStdout = null;
      if (options.i) overwriteStdout = logger;
      uploadSsl(overwriteStdout, protocol, dev.ip, account, password, defCert, defCertkey);
    }
  });
}

function launchGo() {
  fillDefaultSettings(options.p);

  if (options.i) {
    makeUi();
    let i = 0;

    const promises = devices.map((dev) =>
      new Promise((resolve) => {
        const protocol = defProtocol || dev.protocol;
        const account = defAccount || dev.account;
        const password = defPassword || dev.password;

        fetchSsl(logger, protocol, dev.ip, account, password, (certInfo) => {
          // Fill in the list
          devList.addItem(dev.ip);
          screen.render();

          // Fill in the checkbox
          const checkbox = createCheckbox(i, dev.ip);
          if (dev.preparedToUpdate === true) {
            checkbox.checked = true;
          }
          screen.render();

          if (certInfo !== undefined) {
            certInfoArr.push(certInfo);
          }

          i++;
          resolve();
        });
      })
    );

    Promise.all(promises).then(() => {
      const submit = createSubmitButton(++i);
      screen.render();

      devList.select(0);
      const certInfo = certInfoArr.find(cert => cert.ip === devList.ritems[devList.selected]);
      if (certView !== undefined) {
        certView.setContent(inspect(certInfo));
      }

      submit.on('press', () => {
        form.submit();
      });

      logger.log(chalk.green('Get all SSL Certificate Info done'));
    });
  } else {
    if (preparedToUpdate.length === 0) {
      console.log(chalk.yellow('No devices are ready to be updated'));
    } else {
      startUpload();
    }
  }
}

function launchConfig() {
  const configFile = options.p;

  // If user doesn't specify any options, then dump all config data
  if (options.r === undefined && options.w === undefined) {
    readConfig(configFile, []);
  }

  // Write is prior than read. Which can let user write and read in one command
  if (options.w !== undefined) {
    if (supportedWriteParam.indexOf((options.w)[0]) < 0) {
      console.log(chalk.red('Got unsupported write parameter ') +
                  chalk.yellow((options.w)[0]));
      console.log(chalk.red('The support write parameters are ') +
                  chalk.yellow(supportedWriteParam));
    } else {
      writeConfig(configFile, options.w, options.a);
    }
  }

  if (options.r !== undefined) {
    let hasInvalidParam = false;

    options.r.forEach((param) => {
      if (supportedReadParam.indexOf(param) < 0 && !ip.isV4Format(param)) {
        console.log(chalk.red('Got unsupported read parameter ') +
                    chalk.yellow(param));
        hasInvalidParam = true;
      }
    });

    if (hasInvalidParam) {
      console.log(chalk.red('The support read parameters are ') +
                  chalk.yellow(`${supportedReadParam} or ip address`));
    } else {
      readConfig(configFile, options.r);
    }
  }
}

function launchDiscover() {
  const configFile = options.p;
  const title = options.t;

  if (ip.isV4Format(options.b) && ip.isV4Format(options.e)) {
    discover(configFile, title, options.b, options.e);
  }
}

