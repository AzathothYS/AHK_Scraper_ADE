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
    //infoMsg("Server started.", "START");

    var promise = Promise.resolve()
        //.then(checkIfUpdateNeeded, null)
        //.then(addUpdateRequestsFromDatabase, null)
        //.then(addRandomRequests, null) // DEBUG
        //.then(fullfillRequests, null)
        //.then(() => {return runScraper(SCRAPER_ARGS_PATH);}, null)
        //.then(processEdTs, null)
        //.then(updateLocalDatabase, null)
        .then(updateFirebase, null)
        .then(() => {
            logI("Server Done.");
            //infoMsg("Server Done", "STOP");
        }, null)
        .catch(() => {
            logE("Server failed!");
            //errorMsg("Server failed!", ""); // TODO : envoyer ce message pour afficher la notif, les autres doivent aller dans le log
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

    let child_process = exec(`python "${WORKING_DIR}database.py" -makeRandomRequests 2`);
    
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

            } else if (data === "ARBO ERROR") {
                logE("Scraper encountered a path error!");
                errorMsg("runScraper-3", "ASK_PATCH", "Erreur de chemin, une action est requise.");

                reject(); // TODO : y'a plus que ça à faire

            } else {
                logE("stdout of scraper is nothing that I can understand! ", data);
                errorMsg("runScraper-4", data);

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

    let updatePromise = Promise.resolve();
    
    for (let i = 0; i < updateLog.length; i++) {
        logI(`Updating '${updateLog[i]["path"]}'...`);

        let filePath = updateLog[i]["path"];

        let file;

        try{
            file = fs.readFileSync(WORKING_DIR + "Database/" + filePath + ".json", {encoding:"UTF-8"});
        } catch (error) {
            if (error.code === "ENOENT") {
                // No such file or directory
                logE("no such file or directory: ", WORKING_DIR + "Database/" + filePath + ".json", " - error: ", error);
            }
            return Promise.reject("No such file or directory: " + WORKING_DIR + "Database/" + filePath + ".json");
        }
        
        let entryName = filePath.substring(filePath.lastIndexOf("/") + 1);

        updatePromise = updatePromise
            .then(() => {
                return uploadToFirebase(filePath, entryName, file, updateLog[i]["checksum"], updateLog[i]["update"], updateLog[i]["true_name"]);
            }, null)
            .catch((reason) => {
                logE("Update failed at the ", i, " element of the updateLog: ", updateLog[i], " - reason: ", reason);
                return Promise.reject();
            })
            .then(() => {
                return updateIndex(path, updateLog[i]["checksum"], updateLog[i]["update"]);
            });
    }

    return updatePromise.then(() => {
            logI("Update finihsed.");
            return Promise.resolve();
        });
}


/**
 * @param {string} path Le path pointant vers l'objet contenant 'entryName'
 * @param {string} entryName Le nom du champ à modifier
 * @param {string} content La nouvelle valeur du champ
 * @param {string} checksum Le checksum de 'content'
 * @param {string} updateTime Va être converti en Date
 * @param {string} trueName Le nom non modifié du fichier, contenant son chemin vers lui dans l'arborescence
 * @param {boolean} isArbo Si on met à jour l'arborescence
 */
function uploadToFirebase(path, entryName, content, checksum, updateTime, trueName, isArbo = false) {

    logI("Starting to update...");

    path = "ADE-Arborescence/" + (isArbo ? "Arborescence" : "Emplois Du Temps") + "/" + path;

    let isDoc = path.match(/\//g).length % 2 == 1; // si il y a un nombre impair de '/', alors le path pointe vers un document, sinon une collection

    if (!isDoc) {
        path += "/__files"; // l'emplacement du contenu des fichiers dans les collections
    }

    if (isArbo) {
        return new Promise((resolve, reject) => {
            firestore.doc(path).set({
                "_arbo_last_update": new Date(updateTime),
                "_checksum": checksum,
                "arborescence": content
            }).then(() => {
                logI("Successfully updated the arborescence");

                resolve();

            }, null)
            .catch((reason) => {
                logE("Unable to udpate the arborescence, beacuse: ", reason);

                reject();
            });
        });
        

    } else {
        return Promise.resolve()
            .then(() => {

                let obj = {};
                obj[entryName] = {
                    "_last_update": new Date(updateTime),
                    "_true_name": trueName,
                    "_checksum": checksum,
                    "file": content
                };

                return firestore.doc(path).set(obj, {merge: true}); // combiné avec 'set',pour avoir le comportement de 'update' sans avoir à ce soucier de la création de documents/collections
            })
            .then(() => {
                logI(`Successfully updated '${entryName}' in '${path}' of name '${trueName}'`);
                return Promise.resolve();
            })
            .catch((reason) => {
                logE(`Unable to update '${entryName}' in '${path}' of name '${trueName}' beacause:\n`, reason);
                return Promise.reject();
            });
    }
}



function updateIndex(path, checksum, lastUpdate) {
    logI("Updating index for file at ", path);

    return Promise.resolve()
        .then(() => {

            let obj = {};
            obj[path] = {
                "checksum": checksum,
                "lastUpdate": lastUpdate
            };

            return firestore.doc("ADE-Arborescence/Index").set(obj, {merge: true});
        })
        .then(() => {
            logI("Index update successful for file at ", path);
            return Promise.resolve();
        })
        .catch((reason) => {
            logE("Unable to update index for file at ", path, " - beacause: ", reason);
            return Promise.reject();
        });
}



function patchArborescence(args) {
    logI("Patching arborescence with args: ", args);

    let child_process = exec(`python "${WORKING_DIR}arborescenceUpdate.py" ${args}`);

    return new Promise((resolve, reject) => {
        child_process.addListener("error", (error) => {
            logE("exec error: ", error);
            errorMsg("patchArborescence-1", error);

            reject();
        });

        child_process.stdout.on("data", (data) => {
            if (data === "OK") {
                logI("Successfully patched arborescence.");

                resolve();

            } else if (data === "ERROR") {
                logE("arborescenceUpdate failed!");
                errorMsg("patchArborescence-2", "");

                reject();

            } else {
                logI("stdout of arborescenceUpdate is nothing that I can understand! ", data);
                errorMsg("patchArborescence-3", data);

                reject();
            }
        });
    });
}




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




var adminTasks = [];

function processAdditionnalTasks() {

    var tasksToDo = Promise.resolve();

    for (var task of adminTasks) {
        switch (task["task"]) {
            case "REQUEST_PATCH":



                tasksToDo.then( )

                tasksToDo.then(() => {return runScraper(WORKING_DIR + "ArboScraper.exe -arbo --startup --path path.txt --out arboPatch.txt --log log.txt");}, null)

                tasksToDo.then(() => {return patchArborescence("-patch arboPatch.txt arbo");}, null);

                break;
            
            case "REQUEST_EDT":

                break;
        }
    }

    return tasksToDo;
}







function processClientMessage(data) {

    let what = data["what"];

    switch (what) {
        case "REQUEST_PATCH":
            let request = data["request"];

            adminTasks.push({
                "task": "REQUEST_PATCH",
                "request": request
            });

            logI("Recieved a patch request from ADMIN client: ", request);
            break;
        
        case "REQUEST_EDT":
            let request = data["request"];

            adminTasks.push({
                "task": "REQUEST_EDT",
                "request": request
            });

            logI("Recieved a edt request from ADMIN client: ", request);
            break;
        
        case "PATCH_OK":

            // TODO

            logI("Recieved ADMIN client says yes for patch request");
            break;

        default:
            logI("Recieved unknown task from ADMIN client: ", data);
            break;
    }
}









// tests FCM Server

const Sender = require("node-xcs").Sender;

let xcs = new Sender("246464569674", "AAAAOWJu4Uo:APA91bHFQViQBgG54yrNv5M5d969eL9V3wv1Q6_74a4NPhbA3v8nxL1GDxBTYRdfjI6__D9A7DBN5QQtbVkk1YnhDoyz-H-bNK4O6hsLkS5LjGDXJchMqC-ouJgTl0Qn4cz09fny-_1p")

xcs.on("message", (msgID, from, data, category) => {
    console.log("recieved msg.");
    logI("msg reçu: ID=", msgID, " from=", from, " category=", category, " data=", data);




});

xcs.on("receipt", (msgID, from, data, category) => {
    console.log("recieved receipt.");
    logI("receipt reçu: ID=", msgID, " from=", from, " category=", category, " data=", data);
});

// ----------------------------

//sendMsgToAdmin("INFO", "very", "swagg", "coucou");

//main();

updateIndex(" Etudiants/IPAG/M2 MFTAP", "404ee87040948976e87645a1d5b09e3b", new Date("2018-07-12 17:20:22"));