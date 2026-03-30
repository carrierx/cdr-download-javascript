# Carrier CDR Download

Download CarrierX Call Data Records via the api.

The application requires NodeJS to run.

## Installation

In the terminal, change directory to the project root and run:

### NPM
```shell
cd nodejs
npm install
```

### Yarn
```shell
cd nodejs
yarn install
```

## Running

In the `nodejs` directory, run the following

```shell
node cxGetCdrs.js <latest | range> <options> outputFileName.csv
```

## Commands - latest & range

There are two commands available: `latest` & `range`. `latest` gets records since the last time it was run and stores the SID of the last downloaded record. `range` gets records in some date range.

### Command latest

The `latest` command tells the downloader to get the records since the last time it was called. This mode is intended to be run on a regular basis (e.g. daily), so it keeps track of the last record received and picks up where it left off.  By default, it will use `./state.json` to store SIDs, but you can specify the file to use.

| Short | Long | Required | Description |
| ----- | ---- | -------- | ----------- |
| -t | --token | Required | Security access token available via the API or in the portal. [Documentation](https://www.carrierx.com/documentation/quick-start/token?show_admin=true#introduction) |
| -s | --state-file | Optional | The file where the app should store the SIDs (record identifiers) for the last record downloaded. **Default - `./state.json`** |
| -b *&lt;date&gt;* | --begin *&lt;date&gt;* | Required | The begining date (and optionally time), inclusive, in ISO 8601 format - YYYY-MM-DD[T[HH:[MM:[SS][Z]]]]. Dates and times are UTC. Examples: 2025-11-01, 2025-11-01T10:00:00Z |
| -e *&lt;date&gt;* | --end *&lt;date&gt;* | Optional | The end date (and optionally time), exclusive, in ISO 8601 format - YYYY-MM-DD[THH:MM:SS]. Dates and times are UTC. **Default - now**. |
| -f  *&lt;format&gt;*| --format *&lt;format&gt;* | Optional | The output format, `csv` or `json`. **Default - `csv`** |
| -o | --overwrite | Optional | Overwrite the output file. By default the app will not overwrite the output file. |
| -y | --type | Optional | The type of records to get. Choices: `call`, `conference`, `message`. **Default - `call`** |
| -h | --help | Optional | Display command help |

#### File name - Required argument

You most specify an output file name where records will be written. The app will create the output file but it will **not** create any directories.

### Command range

The `range` command downloads records in the specified date range. If an end date isn't supplied, all records since `begin` are downloaded.

__NOTE__ State is not saved with the `range` command. If you use the `range` command, a subsequent `latest` command will not pick up after the last `range` record downloaded.

| Short | Long | Required | Description |
| ----- | ---- | -------- | ----------- |
| -t | --token | Required | Security access token available via the API or in the portal. [Documentation](https://www.carrierx.com/documentation/quick-start/token?show_admin=true#introduction) |
| -b *&lt;date&gt;* | --begin *&lt;date&gt;* | Required | The begining date (and optionally time), inclusive, in ISO 8601 format - YYYY-MM-DD[T[HH:[MM:[SS][Z]]]]. Dates and times are UTC. Examples: 2025-11-01, 2025-11-01T10:00:00Z |
| -e *&lt;date&gt;* | --end *&lt;date&gt;* | Optional | The end date (and optionally time), exclusive, in ISO 8601 format - YYYY-MM-DD[THH:MM:SS]. Dates and times are UTC. **Default - now**. |
| -f  *&lt;format&gt;*| --format *&lt;format&gt;* | Optional | The output format, `csv` or `json`. **Default - `csv`** |
| -o | --overwrite | Optional | Overwrite the output file. By default the app will not overwrite the output file. |
| -y | --type | Optional | The type of records to get. Choices: `call`, `conference`, `message`. **Default - `call`** |
| -h | --help | Optional | Display command help |

#### File name - Required argument

## Examples

__NOTE__ Use caution entering an access token on the command line as commands, and therefore tokens, can be saved in command history files.  All examples below use an environment variable `$CX_TOKEN` where the token is stored.

### Get all CDRs

```shell
node cxGetCdrs.js latest --token $CX_TOKEN path_to/cdrs.csv
```

__CAUTION__ The first time this is run, it has the potential to create a very large file. It may be useful to specify a recent beginning date if you don't need the entire history of CDRs.

### Since some date

```shell
node cxGetCdrs.js latest --token $CX_TOKEN --begin 2024-10-31 path_to/cdrs.csv
```
or

```shell
node cxGetCdrs.js range --token $CX_TOKEN --begin 2024-10-31 path_to/cdrs.csv
```

The only difference is that using command `range`, the state won't be save - the last record SID isn't stored.

### Date range

```shell
node cxGetCdrs.js range --token $CX_TOKEN --begin 2024-10-31 --end 2024-11-06 path_to/cdrs.csv
```

The `end` is exclusive, so only records before `end` are included.

### Time range - 1 hour

```shell
node cxGetCdrs.js --token $CX_TOKEN --begin 2024-10-31T18:00:00 --end 2024-10-31T19:00:00 path_to/cdrs.csv
```

### As JSON

```shell
node cxGetCdrs.js latest --token $CX_TOKEN --format json path_to/cdrs.json
```

### Overwrite output

By default, the app will not overwrite an existing file. If you want to overwrite the file, you need to specify `-o` or `--overwrite`.

```shell
node cxGetCdrs.js latest --token $CX_TOKEN --overwrite path_to/cdrs.csv
```

### Conference records

If you want conference records instead of SIP call records, specify `-y conference` or `--type conference`.

```shell
node cxGetCdrs.js latest --token --type conference path_to/cdrs.csv
```

### Message Delivery records

If you want message delivery records instead of SIP call records, specify `-y message` or `--type message`.

```shell
node cxGetCdrs.js latest --token --type conference path_to/cdrs.csv
```
