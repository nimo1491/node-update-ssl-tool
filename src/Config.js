import fs from 'fs';
import chalk from 'chalk';
import ip from 'ip';
import { inspect } from 'util';

export function writeConfig(configFile, keys, assigned) {
  let configData;
  let isFileExisted;

  try {
    fs.statSync(configFile);
    isFileExisted = true;
  } catch (e) {
    isFileExisted = false;
  }

  // All data will be maintained in configData
  if (isFileExisted) {
    configData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } else {
    configData = {};
  }

  // Start importing
  if (keys[0] === 'devices') {
    const newDev = {
      ip: keys[1],
      preparedToUpdate: true
    };

    if (ip.isV4Format(keys[1])) {
      // Append a device
      if (configData.hasOwnProperty('devices')) {
        const selectedDevIndex = configData.devices.findIndex(dev => dev.ip === keys[1]);

        if (selectedDevIndex < 0) {
          if (assigned !== undefined) {
            newDev[assigned[0]] = assigned[1];
          }
          configData.devices.push(newDev);
          console.log(chalk.green(`...${keys[1]}: OK`));
        } else {
          // Modify the device
          if (assigned !== undefined) {
            const toBeModified = configData.devices[selectedDevIndex];
            toBeModified[assigned[0]] = assigned[1];
            configData.devices[selectedDevIndex] = toBeModified;
          } else {
            console.log(chalk.cyan(`...${keys[1]} already existed, so skip importing this one`));
          }
        }
      } else {
        // First time to add the device
        configData.devices = [];
        if (assigned !== undefined) {
          newDev[assigned[0]] = assigned[1];
        }
        configData.devices.push(newDev);
        console.log(chalk.green(`...${keys[1]}: OK`));
      }
    }
  } else {
    configData[keys[0]] = keys[1];
  }

  // Dump configData into the file as JSON format
  try {
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
  } catch (e) {
    console.log(chalk.red('Got something wrong when writing the file'));
  }
}

export function readConfig(confFile, keys) {
  let configData;

  try {
    configData = JSON.parse(fs.readFileSync(confFile, 'utf-8'));
  } catch (e) {
    console.log(chalk.red('Cannot find the config file'));
  }

  if (keys.length === 0) {
    keys.push('all');
  }

  console.log(chalk.green('Here you are:'));

  keys.forEach((key) => {
    if (key === 'all') {
      for (const prop in configData) {
        if (configData.hasOwnProperty(prop)) {
          console.log(chalk.magenta(`${prop}: `) + chalk.cyan(inspect(configData[prop])));
        }
      }
    } else if (ip.isV4Format(key)) {
      if (configData.hasOwnProperty('devices')) {
        const device = configData.devices.find(dev => dev.ip === key);
        console.log(chalk.magenta(`${key}: `) + chalk.cyan(inspect(device)));
      }
    } else {
      for (const prop in configData) {
        if (configData.hasOwnProperty(prop) && prop === key) {
          console.log(chalk.magenta(`${prop}: `) + chalk.cyan(inspect(configData[prop])));
        }
      }
    }
  });
}
