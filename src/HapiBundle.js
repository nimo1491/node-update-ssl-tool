import bmcHapi from 'node-bmc-hapi';
import chalk from 'chalk';

export async function uploadSsl(output, protocol, ipAddr, account, password, cert, key) {
  let localStdout;

  if (output === null) {
    localStdout = console;
  } else {
    localStdout = output;
  }

  localStdout.log(chalk.blue('Starting update SSL to ') + chalk.yellow.bold(ipAddr));

  try {
    let cc;

    // Login
    const loginRes = await bmcHapi.login(protocol, ipAddr, account, password);

    if (loginRes.cc !== 0) {
      localStdout.log(chalk.red(
        'Login failed. Please make sure your account/password are correct'
      ));
      return;
    }

    // Upload SSL Cert
    cc = await bmcHapi.uploadSslCert(protocol, ipAddr, loginRes.cookie, loginRes.token, cert);
    if (cc !== 200) {
      localStdout.log(chalk.red(`Upload SSL Cert: ${cc}`));
    }

    // Upload SSL Key
    cc = await bmcHapi.uploadSslKey(protocol, ipAddr, loginRes.cookie, loginRes.token, key);
    if (cc !== 200) {
      localStdout.log(chalk.red(`Upload SSL Key: ${cc}`));
    }

    // Validate SSL
    cc = await bmcHapi.validateSsl(protocol, ipAddr, loginRes.cookie, loginRes.token);
    if (cc !== 200) {
      localStdout.log(chalk.red(`Validate SSL: ${cc}`));
    }

    // Restart HTTPS and logout
    cc = await bmcHapi.restartHttps(protocol, ipAddr, loginRes.cookie, loginRes.token);
    if (cc !== 200) {
      localStdout.log(chalk.red(`Restart HTTPS: ${cc}`));
    }

    localStdout.log(chalk.blue('Successfully updating SSL to ') + chalk.yellow.bold(ipAddr));
  } catch (err) {
    localStdout.log(chalk.bgRed(err));
  }
}

export async function fetchSsl(output, protocol, ipAddr, account, password, cb) {
  let localStdout;

  if (output === null) {
    localStdout = console;
  } else {
    localStdout = output;
  }

  localStdout.log(`${ipAddr}: Get SSL`);

  let certRes = {};
  try {
    // Login
    const loginRes = await bmcHapi.login(protocol, ipAddr, account, password);
    if (loginRes.cc !== 0) {
      localStdout.log(chalk.red(
        'Login failed. Please make sure your account/password are correct'
      ));
      return;
    }

    // Get SSL Cert
    certRes = await bmcHapi.getSslCert(protocol, ipAddr, loginRes.cookie, loginRes.token);
    if (certRes.cc !== 0) {
      localStdout.log(chalk.red(`Get SSL Cert: ${certRes.cc}`));
    } else {
      certRes.certInfo.ip = ipAddr;
    }

    // Logout
    const cc = await bmcHapi.logout(protocol, ipAddr, loginRes.cookie, loginRes.token);
    if (cc !== 0) {
      localStdout.log(chalk.red(`Logout: ${cc}`));
    }
  } catch (err) {
    localStdout.log(chalk.black.bgRed(err));
  }

  localStdout.log(`${ipAddr}: Get SSL done`);
  cb(certRes.certInfo);
}

