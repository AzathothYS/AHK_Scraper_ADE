const exec = require("child_process").exec;
const fs = require("fs");
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


function main() {
    infoMsg("Server started.");

    checkIfUpdateNeeded();

    //checkIfArborescenceUpdateNeeded(); // TODO : trouver un moyen d'attendre que updateNeeded a fini (un thread qui attend le changememt d'une valeur?)
}



function checkIfArborescenceUpdateNeeded() {
    console.log("Checking if an update to the Arborescence is needed...");

    // TODO
}



function checkIfUpdateNeeded() {
    console.log("Checking if updates are needed...");

    firestore.doc("Requests/requests").get()
        .then(doc => {
            if (!doc || !doc.exists) {
                console.log("Returned doc is nonexistent/null.");
                return;
            }

            console.log("Getting requests...");
            
            let req_arr = doc.get("requests");
            if (!req_arr) {
                console.log("No requests.");
                
            } else {
                req_str = "";
                for (request in req_arr) {
                    req_str += request + "\n";
                }
                fs.writeFileSync(WORKING_DIR + "requests.txt", req_str);
                console.log("Wrote requests of firebase to 'requests.txt' : " , req_str);
            }

            addUpdateRequestsFromDatabase();

        }, reason => {
            console.log("Unable to access document 'Requests/requests because of: ", reason);

            errorMsg("checkIfUpdateNeeded", toString(reason));
        });
}


function addUpdateRequestsFromDatabase() {
    console.log("Running database to get updates...");

    exec(`python "${WORKING_DIR}database.py" -getUpdates`,
        (error, stdout, stderr) => {
            if (error !== null) {
                console.log("exec error: ", error);

                errorMsg("addUpdateRequestsFromDatabase-1", error);

            } else {
                if (stdout === "OK") {
                    // tout fonctionnne
                    console.log("Got updates from requests.");

                    fullfillRequests();

                } else if (stdout === "ERROR") {
                    // tout ne fonctionne pas
                    console.log("Unable to get requests of database.");

                    errorMsg("addUpdateRequestsFromDatabase-2", "");
                    
                } else {
                    // tout n'est pas fonctionne
                    console.log("stdout of makePathFileFromRequests is nothing that I can understand!", stdout);     
                    
                    errorMsg("addUpdateRequestsFromDatabase-3", stdout);
                }
            }
        });
}


function fullfillRequests() {
    console.log("Running the path maker script...");

    exec(`python "${WORKING_DIR}makePathFileFromRequests.py"`,
        (error, stdout, stderr) => {
            if (error !== null) {
                console.log("exec error: ", error);

                errorMsg("fullfillRequests-1", error);

            } else {
                if (stdout === "OK") {
                    // tout va bien
                    console.log("Done fullfilling requests.");
                    
                    runScraper(SCRAPER_ARGS_PATH);

                } else if (stdout === "ERROR") {
                    // tout va mal
                    console.log("makePathFileFromRequests failed!");

                    errorMsg("fullfillRequests-2", "");

                } else {
                    // tout est rien compris
                    console.log("stdout of makePathFileFromRequests is nothing that I can understand!", stdout);

                    errorMsg("fullfillRequests-3", stdout);
                }
            }
        });
}


function runScraper(args) {
    console.log("Running the scraper script...");

    exec(`"${WORKING_DIR}ArboScraper.exe" ${args}`,
        (error, stdout, stderr) => {
            if (error !== null) {
                console.log("exec error: ", error);

                errorMsg("runScraper-1", error);

            } else {
                if (stdout === "OK") {
                    // tout est cool
                    console.log("Scraper is Done.");

                    processEdTs();

                } else if (stdout === "ERROR") {
                    // tout est erreur
                    console.log("Scraper failed!");

                    errorMsg("runScraper-2", "");

                } else {
                    // tout est confusion
                    console.log("stdout of scraper is nothing that I can understand!", stdout);

                    errorMsg("runScraper-3", stdout);
                }
            }
        });
}


function processEdTs() {
    console.log("Processing EdTs...");

    exec(`"${WORKING_DIR}icsToJson.py"`,
        (error, stdout, stderr) => {
            if (error != null) {
                console.log("exec error: ", error);

                errorMsg("processEdTs-1", error);

            } else {
                if (stdout === "OK") {
                    // tout est super génial
                    console.log("Successfully processed EdTs.");
                    updateLocalDatabase();

                } else if (stdout === "ERROR") {
                    // tout est super triste
                    console.log("icsToJson failed!");

                    errorMsg("processEdTs-2", "");

                } else {
                    // tout est super incompris
                    console.log("stdout of icsToJson is nothing that I can understand!", stdout);

                    errorMsg("processEdTs-3", stdout);
                }
            }
        });
}


function updateLocalDatabase() {
    console.log("Updating local database...");

    exec(`"${WORKING_DIR}database.py" -update`,
        (error, stdout, stderr) => {
            if (error != null) {
                console.log("exec error: ", error);

                errorMsg("updateLocalDatabase-1", error);

            } else {
                if (stdout === "OK") {
                    // tout est oui
                    console.log("Database Updated.");
                    
                } else if (stdout === "ERROR") {
                    // tout est non
                    console.log("update of database failed!");

                    errorMsg("updateLocalDatabase-2", "");

                } else {
                    // tout est wat
                    console.log("stdout of database is nothing that I can understand!", stdout);

                    errorMsg("updateLocalDatabase-3", stdout);
                }
            }
        });
}


function updateFirebase() {
    console.log("Reading update log...");
    
    let updateLog = JSON.parse(fs.readFileSync(`${WORKING_DIR}Database/updateLog.txt`, "utf-8"));

    console.log("Update log: ", updateLog);
    
    for (fileInfo in updateLog) {
        console.log(`Updating '${fileInfo["path"]}'...`);

        let filePath = fileInfo["path"];

        let file = fs.readFileSync(WORKING_DIR + "Database/" + filePath);

        let entryName = filePath.substring(filePath.lastIndexOf("/") + 1);

        uploadToFirebase(filePath, entryName, file, fileInfo["update"], fileInfo["true_name"]);
    }

    console.log("Update finihsed.");
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

    let isDoc = path.match(/,/g).length % 2 == 0; // si il y a u nombre pair de '/', alors le path pointe vers un document, sinon une collection

    if (!isDoc) {
        path += "/__files"; // l'emplacement du contenu des fichiers dans les collections
    }

    if (isArbo) {
        firestore.doc(path).set({
            "arbo_last_update": new Date(updateTime),
            "arborescence": content
        }).then(() => {
            console.log("Successfully updated the arborescence");
        }, reason => {
            console.log("Unable to pudpate the arborescence, beacuse:\n", reason);
        })

    } else {
        firestore.doc(path).update({
            entryName: {
                "last_update": new Date(updateTime),
                "true_name": trueName,
                "file": content
            }
        }).then(() => {
            console.log(`Successfully updated '${entryName}' in '${path}' of name '${trueName}'`);
        }, reason => {
            console.log(`Unable to update '${entryName}' in '${path}' of name '${trueName}' beacause:\n`, reason);
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
            console.log("Successfully sent message: ", response);
        })
        .catch((error) => {
            console.log("Unable to send message because: ", error);
        });
}


console.log("Server started.");

main();