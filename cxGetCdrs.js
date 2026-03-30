#!/usr/bin/env nodejs

const {Argument, Command, program, Option} = require('commander');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const jsonfile = require('jsonfile');
const path = require('path');


const BASE_URL = 'https://api.carrierx.com/core/v2';
const CDR_URL_CALLS = `${BASE_URL}/calls/call_drs`;
const CDR_URL_CONFERENCE = `${BASE_URL}/app/conference/calls`;
const CDR_URL_MESSAGE = `${BASE_URL}/sms/message_drs`;
const PAGE_SIZE = 1_000
const DEFAULT_STATE_FILE = './state.json'


class CdrGetter {
  #begin;
  #csvWriter;
  #command;
  #state;
  #stateFile;
  #end;
  #filename;
  #format;
  #jsonData;
  #nextUrl;
  #overwrite;
  #type;
  #token;
  #url;

  constructor(command, filename, options) {
    this.#state = {
      call_sid: null,
      conference_sid: null,
      message_sid: null,
    };
    this.#jsonData = new Array();
    this.#token = options.token;
    this.#command = command;
    this.#type = options.type;
    try {
      this.#begin = this.#getDateString(options.begin);
    } catch (error) {
      if (this.#command === 'range') {
        throw new Error('Invalid start date');
      } if (options.begin) {
        throw new Error('Invalid begin date');
      }
    }
    try {
      this.#end = this.#getDateString(options.end);
    } catch (error) {
      this.#end = this.#getDateString(new Date().toISOString());
    }
    this.#format = options.format;
    this.#nextUrl = null;
    this.#overwrite = options.overwrite;
    this.#stateFile = options.stateFile;
    switch (this.#type) {
      case 'conference':
        this.#url = CDR_URL_CONFERENCE;
        break;
      case 'message':
        this.#url = CDR_URL_MESSAGE;
        break;
      case 'call':
        this.#url = CDR_URL_CALLS;
        break;
    }
    this.#filename = filename;
    if (!this.#dirExists(this.#filename)) {
      throw new Error(`Directory "${path.dirname(this.#filename)}" does not exist.`);
    }
    if (fs.existsSync(this.#filename) && !this.#overwrite) {
      throw new Error(`Output file exists. Use --overwrite to overwrite output file.`);
    }
  }

  #dirExists = (filename) => {
    try {
      return fs.existsSync(path.dirname(filename));
    } catch (error) {
      return false;
    }
  }

  #getDateString = (date) => {
      return this.#getCleanDate(date).toISOString().split('.')[0] + 'Z';
  }

  #getCleanDate = (date) => {
    return this.#hasTimeZone(date) ? new Date(date) : new Date(`${date}Z`);
  }

  #hasTimeZone = (date) => {
    return Boolean(date.match(/[+-][\d][\d]:[\d][\d]$/) || date.match(/Z$/));
  }

  #loadState = async () => {
    if (this.#command === 'latest') {
      try {
        this.#state = await jsonfile.readFile(this.#stateFile);
      } catch (error) {
        this.#state = {
          call_sid: null,
          conference_sid: null,
          message_sid: null,
        };
      }
    }
  }

  #saveState = async () => {
    if (this.#command === 'latest') {
      await jsonfile.writeFile(
        this.#stateFile,
        this.#state,
        {spaces: 2}
      );
    }
  }

  #getLastSid = () => {
    if (this.#type === 'call') {
      return this.#state.call_sid;
    } else if (this.#type === 'conference') {
      return this.#state.conference_sid;
    } else if (this.#type === 'message') {
      return this.#state.message_sid;
    }
  }

  #setLastSid = (item) => {
    if (this.#type === 'call') {
      this.#state.call_sid = item?.dr_sid;
    } else if (this.#type === 'conference') {
      this.#state.conference_sid = item?.call_sid;
    } else if (this.#type === 'message') {
      this.#state.message_sid = item?.dr_sid;
    }
    this.#saveState();
  }

  #isBeyondEnd = (cdr) => {
    if (this.#command === 'range') {
      return this.#getCleanDate(cdr.date_stop) >= this.#getCleanDate(this.#end);
    }
    return false;
  }

  #filterItems = (items) => {
    return items.filter(item => !this.#isBeyondEnd(item));
  }

  #fetchCdrs = async (url, params) => {
    const u = new URL(url);
    for (const [key, value] of Object.entries(params || {})) {
      if (value != null) {
        u.searchParams.set(key, String(value));
      }
    }
    const r = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#token}`,
      },
    });
    const data = await r.json()
    this.#nextUrl = data?.pagination?.next;
    return data;
  }

  #getFirstCdr = async () => {
    const params = {
      limit: 1,
      order: 'date_stop',
    };
    if (this.#begin) {
      params.filter = `date_stop ge ${this.#getDateString(this.#begin)}`;
    }
    return await this.#fetchCdrs(this.#url, params);
  }

  #getCdrsLatest = async () => {
    const params = {
      order: 'date_stop',
      after: this.#getLastSid(),
    };
    return await this.#fetchCdrs(this.#url, params);
  }

  #cdrRowForCsv = (cdr) => {
    const row = {...cdr};
    const ud = row.user_data;
    if (ud != null && typeof ud === 'object') {
      row.user_data = JSON.stringify(ud);
    }
    return row;
  }

  #initCsv = async (cdr) => {
    const header = new Array();
    for (const key in cdr) {
      header.push({
        id: key,
        title: key,
      });
    }
    this.#csvWriter = createCsvWriter({
      path: this.#filename,
      header,
    });
  }

  #writeCsv = async (cdrs) => {
    const rows = cdrs.items.map((item) => this.#cdrRowForCsv(item));
    if (!this.#csvWriter) {
      this.#initCsv(rows[0]);
    }
    await this.#csvWriter.writeRecords(rows);
  }

  get = async () => {
    await this.#loadState();
    let page = 0;
    let willBreak = false;
    while (true) {
      let isSingleFetch = false;
      console.log(`Page: ${page}`);
      let cdrs = null;
      if (page === 0) {
        if (this.#begin) {
          cdrs = await this.#getFirstCdr();
          isSingleFetch = true;
        } else {
          cdrs = await this.#getCdrsLatest();
        }
      } else if (page === 1 && this.#begin) {
        cdrs = await this.#getCdrsLatest();
      } else {
        cdrs = await this.#fetchCdrs(this.#nextUrl, {});
      }
      if (cdrs?.count === 0) break;
      if (this.#command === 'range' && this.#isBeyondEnd(cdrs.items[cdrs.items.length - 1])) {
        cdrs.items = this.#filterItems(cdrs.items);
        willBreak = true;
      }
      this.#setLastSid(cdrs?.items?.[cdrs?.items?.length - 1]);
      if (this.#format === 'csv') {
        await this.#writeCsv(cdrs);
      } else {
        this.#jsonData = this.#jsonData.concat(cdrs.items);
      }
      if (willBreak || (!isSingleFetch && cdrs.count < PAGE_SIZE)) break;
      page++;
    }
    if (this.#format === 'json') {
      await jsonfile.writeFile(
        this.#filename,
        this.#jsonData,
        {spaces: 2}
      );
    }
  }
}

const main = async (command, filename, options) => {
  try {
    const getter = new CdrGetter(command, filename, options);
    getter.get();
  } catch (error) {
    console.error(error.message);
  }
}

optionToken = new Option('-t, --token <access_token>', 'Security access token available in the portal.').makeOptionMandatory();
optionBegin = new Option('-b, --begin <date>', 'The begining date (and optionally time), inclusive, in ISO 8601 format.');
optionEnd = new Option('-e, --end <date>', 'The ending date (and optionally time), exclusive, in ISO 8601 format. Default is now.');
optionFormat = new Option('-f, --format <format>', 'output format')
  .choices(['csv', 'json'])
  .default('csv');
optionOverwrite = new Option('-o, --overwrite', 'Overwrite the output file. By default will not overwrite.');
optionType = new Option('-y, --type <type>', 'The type of CDR to get. Default is call.')
  .choices(['call', 'conference', 'message'])
  .default('call');
optionStateFile = new Option('-s, --state-file <state_file>', 'The file in which to store the last SID for the next run. Default is ' + DEFAULT_STATE_FILE)
  .default(DEFAULT_STATE_FILE);
argFilename = new Argument('<filename>', 'File where the CDRs should be written');

const latestCommand = new Command('latest')
  .description('Download CarrierX call detail records after the last retrieved CDR')  
  .addOption(optionToken)
  .addOption(optionBegin)
  .addOption(optionFormat)
  .addOption(optionOverwrite)
  .addOption(optionType)
  .addOption(optionStateFile)
  .addArgument(argFilename)
  .action((filename, options) => main('latest', filename, options));

const rangeCommand = new Command('range')
  .description('Download CarrierX call detail records between two dates')
  .addOption(optionToken)
  .addOption(optionBegin)
  .addOption(optionEnd)
  .addOption(optionFormat)
  .addOption(optionOverwrite)
  .addOption(optionType)
  .addArgument(argFilename)
  .action((filename, options) => main('range', filename, options));

program
  .description('Download CarrierX call detail records')
  .addCommand(latestCommand)
  .addCommand(rangeCommand);
  program.parse()
  const options = program.opts();
