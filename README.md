# node-update-ssl-tool


> Update SSL Certificates for Data Center

Update all at once


## Install

Install dependencies.

```bash
$ npm install
```

## Run

```bash
$ npm start
```

## Lint

```bash
$ npm run lint
```

## Usage

```
$ cUpdateSslTool <command> [options]
```


### command

*Note: At least provide one command or you will see the error message*

- `go`: start update or go to interactive mode
- `config`: read or write config file
- `discover`: discover the devices and then import to the file


### options

Different commands have different options


#### go

*Note: Please make sure all needed data (config, cert, key) are ready or you will see the error message*

- `-i`: open interactive mode
- `-p $CONF`: use $CONF instead of the default config file.

Example 1: Go to interactive mode
```
$ cUpdateSslTool go -i
```

Example 2: Start to update under CLI (just go!!!)
```
$ cUpdateSslTool go
```

Example 3: Read `myConf.json` and start to update under CLI
```
$ cUpdateSslTool go -p myConf.json
```

Example 4: Read `myConf.json` and then open interactive mode
```
$ cUpdateSslTool go -p myConf.json -i
```


#### config

- `-r $PARAM1 $PARAM2 ...`: read parameter(s) from the default config file
- `-w $PARAM $VALUE`: write the value to the paramter and save to the default config file
- `-a $PARAM $VALUE`: write the value to the paramter of the give device and save to the default config file
- `-p $CONF`: use $CONF instead of the default config file.

Example 1: Read all data from the default config file
```
$ cUpdateSslTool config
```
or
```
$ cUpdateSslTool config -r
```
or
```
$ cUpdateSslTool config -r all
```

Example 2: Read protocol from the default config file
```
$ cUpdateSslTool config -r protocol
```

Example 3: Read multiple parameters from the default config file
```
$ cUpdateSslTool config -r protocol account
```

Example 4: Read all info of 192.168.0.100 from `myConf.json`
```
$ cUpdateSslTool config -r 192.168.0.100 -p myConf.json
```

Example 5: Write default protocol to `http` to the default config file
```
$ cUpdateSslTool config -w protocol http
```

Example 6: Combine write and read
```
$ cUpdateSslTool config -r all -w protocol http
```

Example 7: Add a device
```
$ cUpdateSslTool config -w devices 192.168.0.200
```

Example 8: Add a device and its parameter
```
$ cUpdateSslTool config -w devices 192.168.0.200 -a account admin
```

*NOTE: The '-a' should be used with '-w'*

Example 9: Same as example 8, but save the result to `myConf.json`
```
$ cUpdateSslTool config -w devices 192.168.0.200 -a account admin -p myConf.json
```

*NOTE: Note that you can read a device's info by just giving an IP address, but you should give a parameter named devices when you write the config*

Below list the supported parameter, you may want to see the [structure of the config file](https://github.com/nimo1491/node-update-ssl-tool#about-the-config-file) if you never use this tool before

##### Supported parameters for `-r`

* all
* cert
* certkey
* protocol
* account
* password
* devices
* `ip address`

##### Supported parameters for `-w`

* cert
* certkey
* protocol
* account
* password
* devices

##### Supported parameters for `-a`

* protocol
* account
* password


### discover

*NOTE: The '-b' and '-e' are required*

- `-b $IP`: beginning of the IP address
- `-e $IP`: Endign of the IP address
- `-t $TITLE`: search for the given title
- `-p $CONF`: use $CONF instead of the default config file.

Example 1: Discover from `192.168.0.0` to `192.168.0.200` and then import to default config file
```
$ cUpdateSslTool discover -b 192.168.0.0 -e 192.168.0.200
```

Example 2: Same as example 1, but use `MyServer` as the search pattern
```
$ cUpdateSslTool discover -b 192.168.0.0 -e 192.168.0.200 -t MyServer
```

Example 3: Same as example 2, but import the result to `myConf.json`
```
$ cUpdateSslTool discover -b 192.168.0.0 -e 192.168.0.200 -t MyServer -p myConf.json
```


## Default option values

Some options have the default value, you can see it in the help usage


## About the config file

The config file plays an important role of this tool.
It is stored as JSON format and has two levels of properties.

The first level properties as below mean the default values for all devices.

- `cert`: the path of cert file
- `certkey`: the path of key file
- `protocol`: trasmission protocol, supports *http* and *https*
- `account`: account for login
- `password`: password for login
- `devices`: all devices

The second level properties as below are inside the `devices` property.
`devices` has an array of the devices, each one can has its specific properties.

- `ip`: ip address, only support IPv4 format (required)
- `protocol`: trasmission protocol, supports *http* and *https*
- `account`: account for login
- `password`: password for login
- `preparedToUpdate`: device won't be really updated if this value is false (required)

The priority of the second level properties is higher that the first level one.

*NOTE: The default `preparedToUpdate` property will be true after discovering or adding a device manually*


## Todo

1. Support removing paramter(s)
2. Support directly fetch the information of SSL certificate


## Maintainers

- [Nimo Hsieh](https://github.com/nimo1491)


## License

MIT © [Nimo Hsieh](https://github.com/nimo1491)

