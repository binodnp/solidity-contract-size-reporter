#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("util");
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const pathExists = util.promisify(fs.exists);
const { Table } = require("console-table-printer");

const MAX_BYTE_CODE_LIMIT = 24576;
const NOTICE_THRESHOLD = 0.8;
const DISPLAY_THRESHOLD = 0.15;
const ERROR_TOO_BIG_TO_DEPLOY = "This contract is too big to be deployed!";
const ERROR_MAXIMUM_CAPACITY_REACHING = "Maximum capacity almost reached. Please refactor.";
const MESSAGE_OK = "OK";

const printNumber = x => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const getContracts = async directory => readdir(directory);

const reportSummary = async (root, searchPath, files, detailed) => {
  const getABI = async file => {
    const contents = await readFile(file);
    const data = JSON.parse(contents.toString());
    return data;
  };

  const result = [];

  for (const file of files) {
    try {
      const filePath = path.join(searchPath, file);
      const abi = await getABI(filePath);
      const deployedBytecodeLength = abi.deployedBytecode.length / 2;
      const bytecodeLength = abi.bytecode.length / 2;
      const sourcePath = abi.sourcePath.replace(root, ".");

      result.push({
        sourcePath,
        deployedBytecodeLength,
        bytecodeLength
      });
    } catch (error) {
      console.error("\x1b[31m", error, "\x1b[0m");
    }
  }

  const filtered = result.filter(x => x.deployedBytecodeLength >= DISPLAY_THRESHOLD * MAX_BYTE_CODE_LIMIT);
  const sorted = (detailed ? result : filtered).sort((a, b) => parseInt(b.deployedBytecodeLength) - parseInt(a.deployedBytecodeLength));

  const table = new Table();

  for (const item of sorted) {
    const { deployedBytecodeLength } = item;

    item.capacity = `${Math.round(100 * (deployedBytecodeLength / MAX_BYTE_CODE_LIMIT), 2)}%`;
    item.bytecodeLength = printNumber(item.bytecodeLength);
    item.deployedBytecodeLength = printNumber(item.deployedBytecodeLength);

    const color = {};

    if (deployedBytecodeLength > MAX_BYTE_CODE_LIMIT) {
      color.color = "red";
      item.message = ERROR_TOO_BIG_TO_DEPLOY;
    } else if (deployedBytecodeLength >= NOTICE_THRESHOLD * MAX_BYTE_CODE_LIMIT) {
      color.color = "magenta";
      item.message = ERROR_MAXIMUM_CAPACITY_REACHING;
    } else {
      color.color = "green";
      item.message = MESSAGE_OK;
    }

    table.addRow(item, color);
  }

  if (sorted.length) {
    console.info("Please review the following contracts!!!");
    table.printTable();
  }
};

(async () => {
  const args = process.argv;
  const root = args[2] || process.cwd();
  const detailed = (args[3] || "false").toLowerCase() === "true";

  const buildDirectory = path.join(root, "build", "contracts");

  const exists = await pathExists(buildDirectory);
  if (!exists) {
    console.error("\x1b[31m", "SCSR: Nothing found in the build directory. Please compile your project first.", "\x1b[0m");
    return;
  }

  const files = await getContracts(buildDirectory);
  reportSummary(root, buildDirectory, files, detailed);
})();
