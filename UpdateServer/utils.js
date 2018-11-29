const moment = require("moment");
const fs = require("fs");

const CONFIG_PATH = "./sources/config.txt";

function load_config() {
    const configFile = fs.readFileSync(CONFIG_PATH, "utf-8").split('\n').map(s => s.trim().split(/ += /));
    let config = {}, section = null, sectionName = "", value = "", replacement, replacementValue;
    for (const line of configFile) {
        if (line.length == 1) {
            if (line[0].length < 2)
                continue; // blank line
            if (section) {
                config[sectionName] = section; // update config before parsing next section
            }
            sectionName = line[0].substring(1, line[0].length - 1);
            section = {};
        } else {
            value = line[1];
            while (value.match(/\${.+}/)) {
                replacement = value.substring(value.indexOf("${") + 2, value.indexOf('}')).split(':');
                if (replacement.length > 1) {
                    replacementValue = config;
                    for (const key of replacement) {
                        replacementValue = replacementValue[key];
                    }
                } else {
                    replacementValue = section[replacement[0]];
                }
                value = value.replace(/(\${.+})/, replacementValue);
            }
            section[line[0]] = value;
        }
    }
    config[sectionName] = section; // last one
    return config;
}

const CONFIG = load_config();

var LOG_SOURCE = "none";
const LOG_PATH = CONFIG.Main.LOG;
function log(tag, ...msgs) {
    let str = moment().format("YYYY-MM-DD HH:mm:ss");

    let callerName = log.caller.name;
    if (callerName == "") {
        callerName = "root";
    } else if (callerName === "logI" || callerName === "logE") {
        callerName = log.caller.caller.name;
        if (callerName == "")
            callerName = "root";
    }

    str += "\t- " + LOG_SOURCE + ":\t" + callerName + ":\t" + tag + " - ";

    let obj;
    for (msg of msgs) {
        if (typeof msg === "string") {
            str += msg + " ";
        } else if (!msg) {
            str += "'" + msg + "'";
        } else if (typeof(msg.toString) !== "undefined") {
            str += "'" + msg.toString() + "' ";
        } else {
            try {
                obj = JSON.stringify(msg, null, 2);
            } catch (error) {
                var cache = [];

                obj = JSON.stringify(msg, function(key, val) {
                    if (val != null && typeof val == "object") {
                        if (cache.indexOf(val) >= 0) {
                            return;
                        }
                        cache.push(val);
                    }
                    return val;
                });
            }

            if (obj === "{}") {
                if ("toString" in msg)
                    str += msg.toString();
                else
                    str += (typeof msg) + " -> empty";

            } else {
                str += obj;
            }
        }
    }
    
    console.log(str);

    str = "\n" + str;
    
    fs.appendFileSync(LOG_PATH, str, "utf8");
}

function logI(...msgs) {
    log("INFO", ...msgs);
}

function logE(...msgs) {
    log("ERROR", ...msgs);
}

function logToErrorFile(msg) {
    fs.appendFileSync(ERRORS_FILE, moment().format("YYYY-MM-DD HH:mm:ss") + '|' + msg + '\n');
}

function setLogSource(value) {
    LOG_SOURCE = value;
}

module.exports = {
    CONFIG: CONFIG,
    logI: logI,
    logE: logE,
    logToErrorFile: logToErrorFile,
    setLogSource: setLogSource
}