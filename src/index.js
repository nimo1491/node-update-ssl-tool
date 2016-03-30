import 'babel-polyfill';
import fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import bmcHapi from 'node-bmc-hapi';
import chalk from 'chalk';

let conf, defCert, defKey;

try {
  conf = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'conf.json'), 'utf-8'));
  defCert = __dirname + '/web-cert.pem';
  defKey = __dirname + '/web-certkey.pem';
} catch (err) {
  console.log(chalk.bgRed(err));
  console.log(chalk.bgRed.bold('Please make sure all needed files are ready.'));
  process.exit(0);
}

async function uploadSsl(protocol, ip, account, password, cert, key) {

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

(function go() {

  const defProtocol = conf.protocol || 'https';
  const defAccount = conf.account || 'admin';
  const defPassword = conf.password || 'admin';
  const devices = conf.devices;

  devices.forEach((dev) => {

    let protocol = defProtocol || dev.protocol;
    let account = defAccount || dev.account;
    let password = defPassword || dev.password;

    uploadSsl(protocol, dev.ip, account, password, defCert, defKey);
  });

}());
