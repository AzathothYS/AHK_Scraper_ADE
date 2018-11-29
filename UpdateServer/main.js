const exec = require("child_process").exec;
const fs = require("fs");

const { CONFIG, logI, logE, logToErrorFile, setLogSource } = require("./utils");

setLogSource("SERVER");

const DATABASE_CMD = `python "${CONFIG.Sources.DATABASE}" `;
const REQUEST_PARSER_CMD = `python "${CONFIG.Sources.REQUESTS_PARSER}" `;
const ADE_SCRAPER_CMD = `node "${CONFIG.Server.ADE_SCRAPER}" `;
const ICS_TO_JSON_CMD = `python "${CONFIG.Sources.ICS_TO_JSON}" `;
const PATCH_ARBORESCENCE_CMD = `python "${CONFIG.Sources.ARBO_UPDATER}" `;

const ERRORS_FILE = CONFIG.Main.ERRORS_LOG;

const firebase = require("firebase-admin");
const serviceAccount = require("./Keys/univ-edt-ade.json");

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseUTL: "https://univ-edt-ade.firebaseio.com"
});

const firemsg = firebase.messaging();
const firestore = firebase.firestore();


function main() {
    logI("Server Start.");

    Promise.resolve()
        .then(async () => {
            // chained awaits, so that if something fails, nothing else will run after
            await handleClientsRequests();
            await handleDatabaseRequests();
            await addRandomRequests();
            await transformRequests();
            await runADEScraper();
            await processUrls();
            await downloadFiles();
            await processEdTs();
            await updateLocalDatabase();
            await updateFirebase();
            await clean();
        })
        .then(() => {
            logI("Server Done.");
        })
        .catch((reason) => {
            logE("Server failed! Error:", reason);
        });
}

function handleClientsRequests() {
    logI("Handling clients requests...");

    return firestore.doc("Requests/requests").get()
        .then((doc) => {
            if (!doc || !doc.exists) {
                logE("Request doc is nonexistent/null.");
                logToErrorFile("requests doc is null");
                return Promise.reject();
            }

            logI("Getting requests...");
            
            let req_arr = doc.data()["requests"];
            if (!req_arr) {
                logI("No requests.");
            } else {
                logI(req_arr.length, " requests to handle.");

                req_str = "";
                for (let i = 0; i < req_arr.length; i++) {
                    req_str += req_arr[i] + "\n";
                }
                fs.writeFileSync(CONFIG.Requests.REQUESTS, req_str);

                logI("Wrote requests from firebase to 'requests.txt'.");
            }

            return Promise.resolve();
        });
}

function handleDatabaseRequests() {
    logI("Getting database updates...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for database get updates."); }, 20 * 1000); // 20 sec
        exec(DATABASE_CMD + "-getUpdates",
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error);
                logToErrorFile("exec error for database get updates");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Got updates from requests.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("Unable to get requests of database.");
                logToErrorFile("error from database get updates");
                reject();
            } else {
                logE("stdout of makePathFileFromRequests is nothing that I can understand! ", stdout);
                logToErrorFile("unintelligible output from database get updates");
                reject();
            }       
        });
    });
}

function addRandomRequests() { // TODO : TEST
    logI("Adding random requests...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for random requests."); }, 20 * 1000) // 20 sec
        exec(DATABASE_CMD + "-makeRandomRequests 2",
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error);
                logToErrorFile("exec error for database make random requests");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Made random requests.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("Unable to make random requests.");
                logToErrorFile("error from database make random requests");
                reject();
            } else {
                logE("Unable to understand stdout of database for randomRequests ", data);
                logToErrorFile("unintelligible output from database make random requests");
                reject();
            }       
        });
    });
}

function transformRequests() {
    logI("Transforming requests...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for request files"); }, 30 * 1000); // 30 sec
        exec(REQUEST_PARSER_CMD + "-parse \"" + CONFIG.Requests.REQUESTS + '"',
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error, "code: ", error.code);
                logToErrorFile("exec error for request parser");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Parsed request.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("Unable to parse requests.");
                logToErrorFile("error from request parser");
                reject();
            } else {
                logE("Unable to understand stdout of request parser ", data);
                logToErrorFile("unintelligible output from request parser");
                reject();
            }       
        });
    });
}

function downloadFiles() {
    logI("Downloading EdTs...");
    
    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for ADE dl files"); }, 5 * 60 * 1000); // 5 min
        exec(ADE_SCRAPER_CMD + "-dlFiles \"" + CONFIG.Requests.FILE_REQUESTS + '"',
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                if (error.code === 20) {
                    // internal error
                    logE("Error occured when downloading EdTs.");
                    logToErrorFile("error from ADE Scraper dl files");
                } else {
                    logE("exec error: ", error);
                    logToErrorFile("exec error for ADEScraper dl files");
                }
                reject();
            } else {
                logI("Done downloading EdTs.");
                resolve();
            }
        });
    });
}

var foldersToScrap = [];
function runADEScraper() {
    logI("Starting ADE Scraper...");

    let command = ADE_SCRAPER_CMD + "-urls \"" + CONFIG.Requests.URL_REQUESTS + "\" 2 2";
    if (foldersToScrap.includes('_')) {
        command += " -arboscrap _ \"" + CONFIG.Requests.ARBO_OUT + '"'; // full scrap
    } else {
        for (folder of foldersToScrap) {
            command += " -arboscrap " + folder + " patch_" + folder + ".txt";
        }
    }

    logI("Command: ", command);
    
    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for ADE dl files"); }, 25 * 60 * 1000); // 25 min
        exec(command,
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                if (error.code === 20) {
                    // internal error
                    logE("Error occured when scraping ADE.");
                    logToErrorFile("error from ADE Scraper");
                } else {
                    logE("exec error: ", error);
                    logToErrorFile("exec error for ADEScraper scrap");
                }
                reject();
            } else {
                logI("Done scraping.");
                resolve();
            }
        });
    });
}

function processUrls() {
    logI("Processing urls...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for patch urls"); }, 30 * 1000); // 30 sec
        exec(REQUEST_PARSER_CMD + "-patch \"" + CONFIG.Requests.URLS_OUT + '"',
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error, "code: ", error.code);
                logToErrorFile("exec error for patch urls");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Patched urls file.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("Unable to patch urls file.");
                logToErrorFile("error from patch urls");
                reject();
            } else {
                logE("Unable to understand stdout of urls patch ", data);
                logToErrorFile("unintelligible output from urls patch");
                reject();
            }       
        });
    });
}

function processEdTs() {
    logI("Processing EdTs...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for icsToJson"); }, 30 * 1000); // 30 sec
        exec(ICS_TO_JSON_CMD,
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error);
                logToErrorFile("exec error for icsToJson");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Successfully processed EdTs.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("icsToJson failed!");
                logToErrorFile("error for ics to json");
                reject();
            } else {
                logE("Unable to understand stdout of icsToJson", data);
                logToErrorFile("unintelligible output from icsToJson");
                reject();
            }
        });
    });
}

function updateLocalDatabase() {
    logI("Updating local database...");

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for database update"); }, 60 * 1000); // 1 min
        exec(DATABASE_CMD + "-update",
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error);
                logToErrorFile("exec error from database update");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Database Updated.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("update of database failed!");
                logToErrorFile("error for database update");
                reject();
            } else {
                logE("stdout of database is nothing that I can understand! ", data);
                logToErrorFile("unintelligible output from database update");
                reject();
            }
        });
    });
}

function updateFirebase() {
    logI("Reading update log...");
    
    const updateLog = JSON.parse(fs.readFileSync(CONFIG.Database.UPDATE_LOG, "utf-8"));

    logI("Update log: ", updateLog);

    let updateChain = Promise.resolve();

    for (let i = 0; i < updateLog.length; i++) {
        logI(`Updating '${updateLog[i]["file_cid"]}'...`);

        let fileName = updateLog[i]["file_cid"],
            file;
        
        try {
            file = fs.readFileSync(CONFIG.Database.EDT_LIST + '/' + fileName + ".json", {encoding: "UTF-8"});
        } catch (error) {
            if (error.code === "ENOENT") {
                logE("no such file or directory: ", CONFIG.Database.EDT_LIST + '/' + fileName + ".json", " - error: ", error);
                logToErrorFile("error update firebase file not found");
            }
            return Promise.reject("No such file or directory: " + CONFIG.Database.EDT_LIST + '/' + fileName + ".json");
        }

        updateChain = updateChain
            .then(() => {
                return uploadToFirebase(fileName, file, updateLog[i]["checksum"], updateLog[i]["update"]);
            })
            .catch((reason) => {
                logE("Update failed at the ", i, " element of the updateLog: ", updateLog[i], " - reason: ", reason);
                logToErrorFile("error update firebase");
            });
    }

    return updateChain
        .then(() => {
            logI("Update finished.");
            return Promise.resolve();
        });
}

/**
 * @param {string} entryName Le nom du champ à modifier
 * @param {string} content La nouvelle valeur du champ
 * @param {string} checksum Le checksum de 'content'
 * @param {string} updateTime Va être converti en Date
 * @param {boolean} isArbo Si on met à jour l'arborescence
 */
function uploadToFirebase(entryName, content, checksum, updateTime, isArbo = false) {
    logI("Starting to update...");

    let path;
    if (isArbo) {
        path = "Arborescences/Globale/" + entryName;
    } else {
        path = "Emplois du Temps/" + entryName;
    }

    if (path.match(/\//g).length % 2 == 0) {
        // si il y a un nombre impair de '/', alors le path pointe vers un document, sinon une collection
        path += "/__files"; // l'emplacement du contenu des fichiers dans les collections
    }

    if (isArbo) {
        return new Promise((resolve, reject) => {
            firestore.doc(path).set({
                "_last_update": new Date(updateTime),
                "_checksum": checksum,
                "arborescence": content
            }).then(() => {
                logI("Successfully updated the arborescence");
                resolve();
            })
            .catch((reason) => {
                logE("Unable to udpate the arborescence, beacuse: ", reason);
                logToErrorFile("error upload to firebase arborescence");
                reject();
            });
        });
    } else {
        return Promise.resolve()
            .then(() => {
                let obj = {
                    "_last_update": new Date(updateTime),
                    "_checksum": checksum,
                    "file": content
                };
                return firestore.doc(path).set(obj);
            })
            .then(() => {
                logI(`Successfully updated '${entryName}'`);
                return Promise.resolve();
            })
            .catch((reason) => {
                logE(`Unable to update '${entryName}' beacause:\n`, reason);
                logToErrorFile("error upload to firebase " + entryName);
                return Promise.reject();
            });
    }
}

function patchArborescence(args) {
    logI("Patching arborescence with args: ", args);

    return new Promise((resolve, reject) => {
        let timeout = setTimeout(() => { reject("Timeout for patch arborescence"); }, 30 * 1000); // 30 sec
        exec(PATCH_ARBORESCENCE_CMD + args,
        (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error instanceof Error) {
                logE("exec error: ", error);
                logToErrorFile("exec error from patch arborescence");
                reject();
            } else if (stderr) {
                logE("stderr:", stderr);
                reject();
            } else if (stdout === "OK") {
                logI("Successfully patched arborescence.");
                resolve();
            } else if (stdout === "ERROR") {
                logE("arborescenceUpdate failed!");
                logToErrorFile("error patch arborescence");
                reject();
            } else {
                logE("stdout of arborescenceUpdate is nothing that I can understand! ", data);
                logToErrorFile("unintelligible output from patch arborescence");
                reject();
            }
        });
    });
}

function clean() {
    logI("Cleaning...");
    
    // clean errors files and temporary files, as everything went right
    fs.writeFileSync(CONFIG.REQUESTS.REQUESTS, "", "utf8");
    fs.writeFileSync(CONFIG.Requests.FILE_REQUESTS, "", "utf8");
    fs.writeFileSync(CONFIG.Requests.URL_REQUESTS, "", "utf8");
    fs.writeFileSync(CONFIG.Requests.URLS_OUT, "", "utf8");
    fs.writeFileSync(ERRORS_FILE, "", "utf8");

    logI("Deleting requests array elements...");

    // 11903  Etudiants|Beaulieu|SPM|L3 PHYSIQUE S5-S6|L3 PHYSIQUE- S5|_CMI

    // empty requests array in firebase
    return firestore.doc("Requests/requests").set({requests: []}, {merge: true});
}

// --------------------------------------------------------------------------------------------------

function infoMsg(msg, details="") {
    sendMsgToAdmin("INFO", msg, "", details);
}

function errorMsg(from, details, msg="Le serveur a rencontré un problème.") {
    sendMsgToAdmin("ERREUR", msg, from, details);
}

function sendMsgToAdmin(title, body, from, extra) {
    let msg = {
        "android": {
            "priority": "normal", // remettre à 'high'
            "data": {
                "title": title.toString(), // on s'assure que toutes les valeurs sont des str
                "body": body.toString(),
                "by": from.toString(),   // 'from' est un nom réservé, d'où 'by'
                "extra": extra.toString()
            }
        },
        "topic": "ADMIN"
    }

    firemsg.send(msg)
        .then((response) => {
            logI("Successfully sent message: ", response);
        })
        .catch((error) => {
            logE("Unable to send message because: ", error);
        });
}

// --------------------------------------------------------------------------------------------------

// TODO : ADMIN


main();
