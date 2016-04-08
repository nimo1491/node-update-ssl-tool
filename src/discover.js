import bmcHapi from 'node-bmc-hapi';
import chalk from 'chalk';
import ip from 'ip';
import { writeConfig } from './Config';

export default function startDiscover(configData, title, beginIp, endIp) {
  const ipList = [];
  const realIpList = [];
  const beginIpNum = ip.toLong(beginIp);
  const endIpNum = ip.toLong(endIp);

  for (let i = beginIpNum; i <= endIpNum; i++) {
    ipList.push(ip.fromLong(i));
  }

  console.log(chalk.blue(`Start discovering BMC from ${beginIp} to ${endIp}`));
  console.log(chalk.blue('Please wait....'));

  const promises = ipList.map((ipAddr) =>
    new Promise((resolve) => {
      detectBmc('https', ipAddr, title, (err, isDev) => {
        if (err) resolve();
        if (isDev) {
          realIpList.push(ipAddr);
        }
        resolve();
      });
    })
  );

  Promise.all(promises).then(() => {
    console.log(chalk.blue('Done and start importing the devices now'));
    console.log(chalk.magenta(`Total got ${realIpList.length} device(s):`));

    realIpList.forEach((dev) => {
      console.log(chalk.magenta(dev));
      writeConfig(configData, ['devices', dev]);
    });

    console.log(chalk.cyan('Done importing the devices. You can check your config file now'));
  });
}

function detectBmc(protocol, ipAddr, title, cb) {
  bmcHapi.detectDev(protocol, ipAddr, title).then((args) => {
    const { isDev } = args;
    cb(null, isDev);
  }).catch((err) => {
    cb(err);
  });
}

