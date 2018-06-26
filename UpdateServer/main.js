const exec = require("child_process").exec;
const fs = require("fs");
const firebase = require("firebase-admin");

const serviceAccount = require("./univ-edt-ade-8fefcdca827e.json");

/*firebase.initializeApp({
    apiKey: "AIzaSyAWk4OKPW97z-vAX2K7wbNucYYqZVyJud4",
    authDomain: "univ-edt-ade.firebaseapp.com",
    databaseURL: "https://univ-edt-ade.firebaseio.com",
    projectId: "univ-edt-ade",
    storageBucket: "univ-edt-ade.appspot.com",
    messagingSenderId: "246464569674"
});*/

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseUTL: "https://univ-edt-ade.firebaseio.com"
});

const firemsg = firebase.messaging();
const firestore = firebase.firestore();

function checkIfUpdateNeeded() {
    console.log("Checking if updates are needed...");
    firestore.doc("Requests/requests").get()
        .then(doc => {
            if (!doc || !doc.exists) {
                console.log("Returned doc is nonexistent/null.");
                return;
            }

            let req_arr = doc.get("requests");
            if (!req_arr) {
                console.log("No requests.");
                return;
            }

            // TODO : ajouter à req_arr les updates de la database

            fullfillRequests(req_arr);

        }, reason => {
            console.log("Unable to access document 'Requests/requests because of: ", reason);

        }).finally(() => {
            checkIfArborescenceUpdateNeeded();
    });
}


function checkIfArborescenceUpdateNeeded() {
    console.log("Checking if an update to the Arborescence is needed...");

    // TODO
}




const WORKING_DIR = "C:/Users/7/Documents/Travail/Univ/App Univ/AHK_Scraper_ADE/";


function fullfillRequests(req_array) {
    let req_str = "python \"" + WORKING_DIR + "makePathFileFromRequests.py\" ";
    req_str += req_array.shift();
    for (let i = 0; i < req_array.length; i++) {
        req_str += "~~~" + req[i];
    }

    console.log("Running the path maker script...");
    exec(req_str,
        (error, stdout, stderr) => {
            if (error !== null) {
                console.log("exec error: ", error);
            } else {
                if (stdout === "OK") {
                    // tout va bien
                    console.log("Done fullfilling requests.");
                    runScraper("-h"); // TODO : ce n'est pas les bons paramètres

                } else if (stdout === "ERROR") {
                    // tout va mal
                    console.log("makePathFileFromRequests failed!");

                    // TODO : envoyer un message (via l'API Pushbullet? : https://docs.pushbullet.com/#send-sms)

                } else {
                    // tout est rien compris
                    console.log("stdout of makePathFileFromRequests is nothing that I can understand!", stdout);
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
            } else {
                if (stdout === "OK") {
                    // tout est cool
                    console.log("Scraper is Done.");
                    processEdTs();

                } else if (stdout === "ERROR") {
                    // tout est erreur
                    console.log("Scraper failed!");

                    // TODO : msg admin

                } else {
                    // tout est confusion
                    console.log("stdout of scraper is nothing that I can understand!", stdout);
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
            } else {
                if (stdout === "OK") {
                    // tout est super génial
                    console.log("Successfully processed EdTs.");
                    updateLocalDatabase();

                } else if (stdout === "ERROR") {
                    // tout est super triste
                    console.log("icsToJson failed!");

                    // TODO : msg admin

                } else {
                    // tout est super incompris
                    console.log("stdout of icsToJson is nothing that I can understand!", stdout);
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
            } else {
                if (stdout === "OK") {
                    // tout est oui
                    console.log("Database Updated.");
                    
                } else if (stdout === "ERROR") {
                    // tout est non
                    console.log("update of database failed!");
                    // TODO : msg admin

                } else {
                    // tout est wat
                    console.log("stdout of database is nothing that I can understand!", stdout);
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





function sendmsgToAdmin(title, body) {

    let msg = {
        "android": {
            "priority": "high",
            "data": {
                "title": title,
                "body": body
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



const NOTIFICATION_BASE = {
    "push": {
        "application_name": "Pushbullet",
        "device_iden": "ujvqoilwEqOsjAiVsKnSTs",
        "body": "TEST\n",
        "client_version": 125,
        "dismissable": true,
        "has_root": false,
        "icon": "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuMjHxIGmVAAAClklEQVR4Xu2TgW7jQAhE8/8/nYoquAQzLIPXdhr7SSunLDMso7vH8+LcAby+l2X3AB6Pz854+DpZwJ6oFp3/AnwpWqSynGrt+VTSADpEC7NeRwY2NYBMw/idHkB3eT0RjKf1YnQdYACVwdpje5G24qf4XuQ5A+g6Gqj3/itE2pGfBfVKXc8soNNoiL23j0K6kZ+l0mtnbgE6ZObRnT4I6TI/z169EVDdXaSi63ogpJ/VKFAVGVYGoXvmgUyvUnlbBFREZqhm6+gRqB7B9HpYLeyuLCK/9W//9aB6BNNrER2rhd2VRSq/FeQXwfRaVEfNen1XIBNbtwOjuiWqIZhexWuqHrALGdh65beC/CKYXqU7M+wQ4R6nCtOrRJqKDwxgNlXP7uw7gDuA9X+zilfY0X1ERtVzy+w7gDuAP2153uv7xh3AAQGgGVtmq5bxCDu3PAJR9dw6m9V/VQCinRKAMDuEowJg+YoARNN979wtEyoPZJfQxbvLC4cFUMUvY5f0ZwYfGcDsJTOWCX6wP1XY/rP5fWnlwbrY6DCw/XtQDmAPOqHN5rQA7MwzQ1gCOPIR0azKfKTb8vZFucWEBS2CsEv634qtMyyKjrgLmsXUpebrUW3E0s0Kt4BmMXWpoTrDWzcr7pLNqSylfyOfzN/z1skIt5DNie58Tf9GPpm/Z9XJiLvIjOjoncX32Hv7W4lqGatu1qADmiF1PZas3xJpR6y6WYMOoxnRYhFSt6fDStU1Ysnm+DvUO+OtK4fIVGr2zCDz8Xeod8ZbVg5iGh1Ldlcl0/k7ppclVG81rXD5ADKi+ehNlwgge88lAtgTOOmsEGTuxwRwVghHMtxQg/jWQOiNfCD2/Ee+/9/4gDuA1/eyXDyA5/MHn38GOIVAxNIAAAAASUVORK5CYII=",
        "notification_id": "-8",
        "notification_tag": "ADE App",
        "package_name": "com.pushbullet.android",
        "source_device_iden": "",
        "source_user_iden": "ujvqoilwEqO",
        "title": "TEST",
        "type": "note"
    },
    "type": "note"
};

const TARGET_USER = {
    "active":true,
    "iden":"ujvqoilwEqO",
    "created":1525028748.9613519,
    "modified":1529499317.619949,
    "email":"lukeb35@gmail.com",
    "email_normalized":"lukeb35@gmail.com",
    "name":"Luke B",
    "image_url":"https://static.pushbullet.com/google-user/79815cb311df996b439bab2fcf949030ed9bbe99419325d740dd6cdd674bcbea",
    "max_upload_size":26214400
};

function sendNotificationToAdmin(title, msg) {
    let pushData = NOTIFICATION_BASE;
    pushData["push"]["title"] = title;
    pushData["push"]["body"] = msg;

    let options = {
        url: "https://api.pushbullet.com/v2/pushes",
        headers: {
            "Access-Token": "o.ztjunYI0QYIU9hwvpqR0EBXDE5zTH9ol",
            "Content-Type": "application/json"
        },
        data: JSON.stringify(pushData)
    };

    curlrequest.request(options,
        (err, response) => {
            console.log("err: ", err);
            console.log("response: ", response);
            console.log("Done.");
    });
}


console.log("Server started.");
//checkIfUpdateNeeded();
//let req = ["/XD/PTDR/LOL", "/THIS/IS/SWAGG/LAND", "/UMAD?"];
//let req = ["/XD/PTDR/LOL"];
let req = [
    "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Gr Physique/Gr.p1 (20)",
    "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Gr Physique/Gr.p1 CMI (6)",
    "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Compléments/Cplt PCS (Gr1)"
];
//fullfillRequests(req);
//sendNotificationToAdmin("swagg", "lol");
sendmsgToAdmin("Server Test", "YES");