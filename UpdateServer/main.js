const exec = require("child_process").exec;
const fs = require("fs");
const moment = require("moment");
const firebase = require("firebase-admin");

const serviceAccount = require("./Keys/univ-edt-ade.json");

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseUTL: "https://univ-edt-ade.firebaseio.com"
});

const firemsg = firebase.messaging();
const firestore = firebase.firestore();


const WORKING_DIR = "C:/Users/7/Documents/Travail/Univ/App Univ/AHK_Scraper_ADE/";
const SCRAPER_ARGS_PATH = WORKING_DIR + "ArboScraper.exe -path --startup --path path.txt --log log.txt";
const SCRAPER_ARGS_ARBO = WORKING_DIR + "ArboScraper.exe"; // TODO

const LOG_FILE_PATH = WORKING_DIR + "log.txt";

function main() {
    logI("Server Start.");
    infoMsg("Server started.");

    var promise = Promise.resolve()
        //.then(checkIfUpdateNeeded, null)
        //.then(addUpdateRequestsFromDatabase, null)
        .then(addRandomRequests, null) // DEBUG
        .then(fullfillRequests, null)
        .then(() => {return runScraper(SCRAPER_ARGS_PATH);}, null)
        .then(processEdTs, null)
        .then(updateLocalDatabase, null)
        .then(updateFirebase, null)
        .then(() => {
            logI("Server Done.");
            infoMsg("Server Done");
        }, null)
        .catch(() => {
            logE("Server failed!");
            errorMsg("Server failed!", "");
        });

    //checkIfArborescenceUpdateNeeded(); // TODO : trouver un moyen d'attendre que updateNeeded a fini (un thread qui attend le changememt d'une valeur?)
}



function logI(...msgs) {
    let str = moment().format("YYYY-MM-DD HH:mm:ss");

    let callerName = logI.caller.name;
    if (callerName == "")
        callerName = "root";

    str += "\t- SERVER:\t" + callerName + ":\t";

    str += "INFO  - ";

    for (msg of msgs) {
        if (typeof msg === "string")
            str += msg;
        else
            str += JSON.stringify(msg, null, 2);
    }
    
    console.log(str);

    str = "\n" + str;
    
    fs.appendFileSync(LOG_FILE_PATH, str, "utf8");
}

function logE(...msgs) {
    let str = moment().format("YYYY-MM-DD HH:mm:ss");

    let callerName = logE.caller.name;
    if (callerName == "")
        callerName = "root";

    str += "\t- SERVER:\t" + callerName + ":\t";

    str += "ERROR - ";

    for (msg of msgs) {
        if (typeof msg === "string")
            str += msg;
        else
            str += JSON.stringify(msg, null, 2);
    }

    console.log(str);
    
    str = "\n" + str;

    fs.appendFileSync(LOG_FILE_PATH, str, "utf8");
}


function checkIfArborescenceUpdateNeeded() {
    logI("Checking if an update to the Arborescence is needed...");

    // TODO
}



function checkIfUpdateNeeded() {
    logI("Checking if updates are needed...");

    return firestore.doc("Requests/requests").get()
        .then(doc => {
            if (!doc || !doc.exists) {
                logE("Returned doc is nonexistent/null.");
                return Promise.resolve();
            }

            logI("Getting requests...");
            
            let req_arr = doc.data()["requests"];
            if (!req_arr) {
                logI("No requests.");
                
            } else {                
                req_str = "";
                for (let i = 0; i < req_arr.length; i++) {
                    req_str += req_arr[i] + "\n";
                }
                fs.writeFileSync(WORKING_DIR + "requests.txt", req_str);

                logI("Wrote requests of firebase to 'requests.txt' : ");
                logI(req_str);
            }

            return Promise.resolve();

        }, reason => {
            logI("Unable to access document 'Requests/requests because of: ", reason);

            errorMsg("checkIfUpdateNeeded", toString(reason));

            return Promise.reject();
        });
}


function addUpdateRequestsFromDatabase() {
    logI("Running database to get updates...");

    let child_process = exec(`python "${WORKING_DIR}database.py" -getUpdates`);
    
    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("addUpdateRequestsFromDatabase-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Got updates from requests.");

                resolve();
                
            } else if (data === "ERROR") {
                logE("Unable to get requests of database.");
                errorMsg("addUpdateRequestsFromDatabase-2", "");

                reject();
                
            } else {
                logE("stdout of makePathFileFromRequests is nothing that I can understand! ", data);
                errorMsg("addUpdateRequestsFromDatabase-3", data);

                reject();
            }
        });
    });
}


function addRandomRequests() {
    // DEBUG
    logI("Adding random requests...");

    let child_process = exec(`python "${WORKING_DIR}database.py" -makeRandomRequests 4`);
    
    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Made random requests.");

                resolve();

            } else if (data === "ERROR") {
                logE("Unable to make random requests.");

                reject();

            } else {
                logE("Unable to understand stdout of database for randomRequests ", data);

                reject();
            }
        });
    });
}


function fullfillRequests() {
    logI("Running the path maker script...");

    let child_process = exec(`python "${WORKING_DIR}makePathFileFromRequests.py"`);

    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("fullfillRequests-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Done fullfilling requests.");

                resolve();

            } else if (data === "ERROR") {
                logE("makePathFileFromRequests failed!");
                errorMsg("fullfillRequests-2", "");
                
                reject();

            } else if (data == "EMPTY") {
                // il n'y a rien a mettre à jour
                logI("No requests.");
                infoMsg("No requests.");

                reject(); // TODO : mieux à faire ?

            } else {
                logE("stdout of makePathFileFromRequests is nothing that I can understand! ", data);
                errorMsg("fullfillRequests-3", data);

                reject();
            }
        });
    });
}


function runScraper(args) {
    logI("Running the scraper script...");

    let child_process = exec(`"${WORKING_DIR}ArboScraper.exe" ${args}`);

    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("runScraper-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Scraper is Done.");

                resolve();

            } else if (data === "ERROR") {
                logE("Scraper failed!");
                errorMsg("runScraper-2", "");

                reject();

            } else {
                logE("stdout of scraper is nothing that I can understand! ", data);
                errorMsg("runScraper-3", data);

                reject();
            }
        })
    })
}


function processEdTs() {
    logI("Processing EdTs...");

    let child_process = exec(`python "${WORKING_DIR}icsToJson.py"`);
    
    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("processEdTs-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Successfully processed EdTs.");

                resolve();

            } else if (data === "ERROR") {
                logE("icsToJson failed!");
                errorMsg("processEdTs-2", "");

                reject();

            } else {
                logI("stdout of icsToJson is nothing that I can understand! ", data);
                errorMsg("processEdTs-3", data);

                reject();
            }
        })
    })
}


function updateLocalDatabase() {
    logI("Updating local database...");

    let child_process = exec(`python "${WORKING_DIR}database.py" -update`);

    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("updateLocalDatabase-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Database Updated.");
                
                resolve();
                
            } else if (data === "ERROR") {
                logE("update of database failed!");
                errorMsg("updateLocalDatabase-2", "");

                reject();

            } else {
                logE("stdout of database is nothing that I can understand! ", data);
                errorMsg("updateLocalDatabase-3", data);

                reject();
            }
        })
    })
}


function updateFirebase() {
    logI("Reading update log...");
    
    let updateLog = JSON.parse(fs.readFileSync(`${WORKING_DIR}Database/updateLog.txt`, "utf-8"));

    logI("Update log: ", updateLog);
    
    for (let i = 0; i < updateLog.length; i++) {
        logI(`Updating '${updateLog[i]["path"]}'...`);

        let filePath = updateLog[i]["path"];

        let file = fs.readFileSync(WORKING_DIR + "Database/" + filePath + ".json");

        let entryName = filePath.substring(filePath.lastIndexOf("/") + 1);

        uploadToFirebase(filePath, entryName, file, updateLog[i]["update"], updateLog[i]["true_name"])
            .catch((reason) => {
                logE("Update failed at the ", i, " element of the updateLog: ", updateLog[i]);

                return Promise.reject();
            });
    }

    logI("Update finihsed.");

    return Promise.resolve();
}


/**
 * @param {string} path Le path pointant vers l'objet contenant 'entryName'
 * @param {string} entryName Le nom du champ à modifier
 * @param {string} content La nouvelle valeur du champ
 * @param {string} updateTime Va être converti en Date
 * @param {string} trueName Le nom non modifié du fichier, contenant son chemin vers lui dans l'arborescence
 * @param {boolean} isArbo Si on met à jour l'arborescence
 */
function uploadToFirebase(path, entryName, content, updateTime, trueName, isArbo = false) {
    path = "ADE-Arborescence/" + (isArbo ? "Arborescence" : "Emplois Du Temps") + "/" + path;

    let isDoc = path.match(/\//g).length % 2 == 0; // si il y a u nombre pair de '/', alors le path pointe vers un document, sinon une collection

    if (!isDoc) {
        path += "/__files"; // l'emplacement du contenu des fichiers dans les collections
    }

    if (isArbo) {
        return new Promise((resolve, reject) => {
            firestore.doc(path).set({
                "arbo_last_update": new Date(updateTime),
                "arborescence": content
            }).then(() => {
                logI("Successfully updated the arborescence");

                resolve();

            }, (reason) => {
                logE("Unable to pudpate the arborescence, beacuse: ", reason);

                reject();
            });
        });
        

    } else {
        return new Promise((resolve, reject) => {
            firestore.doc(path).update({
                entryName: {
                    "last_update": new Date(updateTime),
                    "true_name": trueName,
                    "file": content
                }
            }).then(() => {
                logI(`Successfully updated '${entryName}' in '${path}' of name '${trueName}'`);

                resolve();

            }, (reason) => {
                logE(`Unable to update '${entryName}' in '${path}' of name '${trueName}' beacause:\n`, reason);

                reject();
            });
        });
    }
}


function infoMsg(msg) {
    sendMsgToAdmin("INFO", msg, "", "");
}


function errorMsg(from, details) {
    sendMsgToAdmin("ERREUR", "Le serveur a rencontré un problème.", from, details);
}


function sendMsgToAdmin(title, body, from, extra) {    

    let msg = {
        "android": {
            "priority": "normal", // remettre à 'high'
            "data": {
                "title": title.toString(), // on s'assure que toutes les valeurs sont des str
                "body": body.toString(),
                "by": from.toString(), // 'from' est un nom réservé
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


main();