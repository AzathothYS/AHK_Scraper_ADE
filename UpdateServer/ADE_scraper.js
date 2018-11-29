const http = require("http");
const request = require("request");
const fs = require("fs");
const exec = require("child_process").exec;

const { CONFIG, logI, logE, logToErrorFile, setLogSource } = require("./utils");

setLogSource("SCRAPER");

var ARBO_FILE_PATH = CONFIG.Request.ARBO_OUT;
const URLS_FILE_PATH = CONFIG.Request.URLS_OUT;

function dateToBase64WithoutJavaShitButJava(date) {
    logI("Encoding", date, " to base64...");

    const process = exec(`java dateAndBase64 encode ${date}`);

    return new Promise((resolve, reject) => {
        process.addListener("error", (error) => {
            logE("exec error:", error);
            logToErrorFile("exec error for encode dataAndBase64");
            reject();
        });

        process.stdout.on("data", (data) => {
            if (data.startsWith("ERROR")) {
                logE("Error occured when using dateAndBase64:", data);
                logToErrorFile("error for encode dataAndBase64");
                reject();

            } else {
                logI(date, " as base64:", data);
                resolve(data);
            }
        });

        setTimeout(reject, 1000);
    });
}

function base64ToIntWithoutJavaShitButJava(string) {
    logI("Decoding", string, "from base64...");

    const process = exec(`java dateAndBase64 decode ${string}`);
    
    return new Promise((resolve, reject) => {
        process.addListener("error", (error) => {
            logE("exec error:", error);
            logToErrorFile("exec error for decode dateAndBase64");
            reject();
        });

        process.stdout.on("data", (data) => {
            if (data.startsWith("ERROR")) {
                logE("Error occured when using dateAndBase64:", data);
                logToErrorFile("error for decode dateAndBase64");
                reject();

            } else {
                let res = new Date(Number(data));
                logI(string, "as date:", res);
                resolve(res);
            }
        });

        setTimeout(reject, 2000);
    });
}

var server, sessionID, timestamp;

class FieldObject {
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
}

class FileObject {
    constructor(obj) {
        this.fileNumber = obj.fileNumber;
        this.isFolder = obj.isFolder;
        this.deepness = obj.deepness;
        this.childrenNumber = obj.childrenNumber;
        this.name = obj.name;
        this.address = obj.address;
        this.rootName = obj.rootName;
        this.children = obj.children;
    }

    /**
     * Pour identifier un dossier/fichier, on a juste besoin de:
     *  - numéro du dossier/fichier (inprédictible)
     *  - si c'est un dossier
     *  - quelle est sa profondeur dans l'arborescence
     *  - le nom interne du dossier root auquel il est relié (la catégorie)
     * 
     * Les paramètres 'childrenStart' et 'childrenEnd' sont utilisés pour les dossiers de plus de 150 fichiers,
     * ADE ne pouvant retourner plus de 150 children par requête, on peut spécifier via 'childrenStart' et 'childrenEnd' 
     * l'intervalle que l'on veut obtenir.
     * Quand ils sont à 0, ADE retourne tous les children du dossier (ou 150 si il en a plus que 150).
     */
    serialize(childrenStart = 0, childrenEnd = 0) {
        return `{"${this.fileNumber}""${this.isFolder}""${this.deepness}""-1""${childrenStart}""${childrenEnd}""0""false"[0]"""${this.rootName}""0""0"[0][0]`;
        /*
        {
        "12036"
        "true"
        "5"
        "-1"
        "0"
        "0"
        "0"
        "false"
        [0]
        "Beaulieu.SPM.L3 STS - S5/S6.L3 PHYSIQUE S5-S6.L3 PHYSIQUE- S5"
        "trainee"
        "1"
        "0"
        [0]
        [0]
        */
    }

    toString() {
        let str = `FileObject={nb:${this.fileNumber},isFolder:${this.isFolder},name:'${this.name}',childNb:${this.childrenNumber}}`;
        if (this.childrenNumber > 0) {
            str += "\n    Children:";
            for (let child of this.children) {
                str += "\n      |-" + child.toString().replace("\n", "      | \n");
            }
        }
        return str;
    }
}

class Method {
    constructor(name, proxy, payload, getPayload) {
        this.name = name;
        this.proxy = proxy;
        this.payload = payload;
        this.getPayload = getPayload;
    }
}

const ADE = {
    SPMHash: "bd72d825015315fe4ffcef9380da990504b949237193e14b0d99039ab0257573373c564c3a1a1c734e9d01407a0f0c3d28cbe883c81d9ddeef015f9604cfa310f1dca9528ca7c323bedb6aab57edb34a3c6dd706b48748c3274a8c092faa7db8c365775eed9c7bedc791fc673a513936961b7aef5230a8b8bd297e580dcd82b1a96c4fad30084a42",
    GWTPermutation: "8990696DB069D68C0723BBB4E51FD7C2",
    urls: {},
    fileUrls: {},
    proxies: {
        core: {
            name: "CorePlanningServiceProxy",
            lib:  "com.adesoft.gwt.core.client.rpc.CorePlanningServiceProxy",
            hash: "B641C6F64F3B566C49E23AD3CA9EA1FE"
        },
        direct: {
            name: "DirectPlanningServiceProxy",
            lib:  "com.adesoft.gwt.directplan.client.rpc.DirectPlanningServiceProxy",
            hash: "D299C8C3CA21CA5E6AFCED14CFFB2A29"
        },                                                                                                   
        web: {
            name: "WebClientServiceProxy",
            lib:  "com.adesoft.gwt.core.client.rpc.WebClientServiceProxy",
            hash: "4119696D5F69F9E2EBD4DE38D3F55A20"
        },
        config: {
            name: "ConfigurationServiceProxy",
            lib: "com.adesoft.gwt.core.client.rpc.ConfigurationServiceProxy",
            hash: "3DC4EEABC300FC7A45EBDC9158AF4F98"
        }
    },
    folders: {
        rootStr: '{"-100""true""-1""-1""-1""-1""0""false"[0]"""""0""0"[0][0]',
        rootObj: new FileObject({
            fileNumber: -100,
            isFolder: true,
            deepness: -1,
            name: "",
            address: "",
            rootName: ""
        }),
        categoriesInternalNames: [
            "", // root
            "trainee",
            "instructor",
            "classroom",
            "equipment",
            "category5",
            "category6",
        ],
        categoriesNames: {
            "type.Category1": " Etudiants",
            "type.Category2": " Enseignants",
            "type.Category3": "Salles",
            "type.Category4": "Equipements",
            "type.Category5": " Matieres",
            "type.Category6": " Autres"
        }
    }
}

ADE.urls = {
    main: "https://planning.univ-rennes1.fr/direct/",
    dlUrl: "https://planning.univ-rennes1.fr/jsp/custom/modules/plannings/cal.jsp?data\x3D"
};
ADE.urls.menu = ADE.urls.main + "index.jsp";
ADE.urls.connect = ADE.urls.menu + "?data=";
ADE.urls.GWT = ADE.urls.main + "gwtdirectplanning/";

ADE.fileUrls = {
    prefix: "8241fc3873200214",
    rootSuffix: "f4311b9343bc34328108e2ec348924488192bcbbe409d97dd0f533a6f63751cc73222219204dfce5eafbf1c95844b5e2352a8d7b559d632c1a751cfea403849c",
    suffix: {
        // le suffixe dépend de l'ID du fichier/dossier, il change si il se trouve entre 0 et 10, 10 et 100, etc... (borne inférieure incluse)
        1: /* 1     */ "423cd51a90bcf93a3cfd5b81b930e6b6cec0db97247709248af069ff1fd12df9a41ecf7689e573022394ed3d0540ad909dacf760c9a92ce150e088e5671690d8",
        2: /* 10    */ "f4311b9343bc34328108e2ec348924488192bcbbe409d97dd0f533a6f63751cc73222219204dfce5eafbf1c95844b5e2352a8d7b559d632c1a751cfea403849c",
        3: /* 100   */ "324cfcf2e9e6b43548a5ef2e24c48817f43b49ed91b3cccdb0db0d7caf18783a47210cef5ce6c4ccc27bb0c132f06ccd29d569558fe3e297ef68fd6b0e2cc571",
        4: /* 1000  */ "e0fa50826f0818afd07cb68a5f59ac56906f45af276f59ae8fac93f781e86152b71afa816f3244e1f6273afaeb8260a8c2973627c2eb073bd4ec119d48c70c7f8d3f4109b6629391",
        5: /* 10000 */ "bd72d825015315fe78f9ccfd31e8991bec7f554d6ed7ba1bbad7b9bdf5b7bdb2b6e425f4064b0d24a3b3f4c7cc4cd75b8af069ff1fd12df9c54e500f9eb327528edd3cda7b61e593",
    }
}

ADE.methods = {
    getBaseHeader: function(method) {
        return method.payload[0] + ADE.urls.GWT + '|' + method.proxy.hash + '|' + method.proxy.lib + '|' + method.name + method.payload[1];
    },

    getChildren: new Method("method4getChildren", ADE.proxies.direct, [
        "7|0|20|",
        "|J|java.lang.String/2004016611|com.adesoft.gwt.directplan.client.ui.tree.TreeResourceConfig/2234901663|",
        "|[I/2970817851|java.util.LinkedHashMap/3008245022|COLOR|com.adesoft.gwt.core.client.rpc.config.OutputField/870745015|LabelColor||com.adesoft.gwt.core.client.rpc.config.FieldType/1797283245|NAME|LabelName|java.util.ArrayList/4159755760|com.extjs.gxt.ui.client.data.SortInfo/1143517771|com.extjs.gxt.ui.client.Style$SortDir/3873584144|1|2|3|4|3|5|6|7|",
        "|8|7|0|9|2|",
        "|",
        "|10|0|2|6|11|12|0|13|11|14|15|11|0|0|6|16|12|0|17|16|14|15|4|0|0|18|0|18|0|19|20|1|16|18|0|"
    ], function(fileObj, childrenStart, childrenEnd) {
        return ADE.methods.getBaseHeader(this)
             + fileObj.serialize(childrenStart + 1, childrenEnd + 1)
             + this.payload[2]
             + timestamp
             + this.payload[3]
             + childrenStart
             + this.payload[4]
             + childrenEnd
             + this.payload[5];
    }),

    getConfiguration: new Method("method1getInitialConfiguration", ADE.proxies.config, [
        "7|0|7|",
        "|J|java.lang.String/2004016611|fr|1|2|3|4|2|5|6|",
        "|7|"
    ], function() {
        return ADE.methods.getBaseHeader(this)
             + timestamp
             + ADE.methods.getConfiguration.payload[2];
    }),

    getNbEvents: new Method("method8getNbEvents", ADE.proxies.core, [
        "7|0|9|",
        "|J|java.util.List|java.util.Date/3385151746|java.util.ArrayList/4159755760|java.lang.Integer/3438268394|1|2|3|4|4|5|6|7|7|",
        "|8|1|9|",
        "|7|",
        "|7|",
        "|"
    ], function(fileID, startTimestamp, endTimestamp) {
        return ADE.methods.getBaseHeader(this)
             + timestamp
             + this.payload[2]
             + fileID
             + this.payload[3]
             + startTimestamp
             + this.payload[4]
             + endTimestamp
             + this.payload[5];
    }),

    getGeneratedUrl: new Method("method9getGeneratedUrl", ADE.proxies.core, [
        "7|0|11|",
        "|J|java.util.List|java.lang.String/2004016611|java.util.Date/3385151746|java.lang.Integer/3438268394|java.util.ArrayList/4159755760|ical|1|2|3|4|6|5|6|7|8|8|9|",
        "|10|1|9|",
        "|11|8|",
        "|8|",
        "|9|2|"
    ], function(fileID, startTimestamp, endTimestamp) {
        return ADE.methods.getBaseHeader(this)
             + timestamp
             + this.payload[2]
             + fileID
             + this.payload[3]
             + startTimestamp
             + this.payload[4]
             + endTimestamp
             + this.payload[5];
    })
};

ADE.getHeaders = function() {
    return {
        "Accept":            "*/*",
        "Accept-Language":   "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type":      "text/x-gwt-rpc; charset=UTF-8",
        "X-GWT-Module-Base": ADE.urls.GWT,
        "X-GWT-Permutation": ADE.GWTPermutation,
        "Cookie":            "JSESSIONID=" + sessionID
    };
};

var phantomProcess = undefined;
function launchPhantomServer() {
    logI("Launching Phantom...");

    phantomProcess = exec(`phantomjs phantom_server.js`);

    phantomProcess.addListener("error", (error) => {
        logI("exec error when running phantom server:", error);
        process.exit(20);
    });

    setupPhantomReciever();
}

function setupPhantomReciever() {
    server = http.createServer((req, res) => {
        logI("Received:", req.method, req.url);
        if (req.headers["content-length"] > 0) {
            var length = req.headers["content-length"];
            var body = "";
            req.on("data", (data) => {
                body += data;
                if (body.length > length)
                    req.connection.destroy(); // too much data
            })
            req.on("end", () => {
                logI("|-> Body:", body);
                parseDataFromPhantom(body);
            })
        }
        res.statusCode = 200;
        res.end();
    });

    server.listen(3042, "127.0.0.1", () => {
        logI("Listening...");
    });
}

function parseDataFromPhantom(data) {
    let obj = JSON.parse(data);

    if (obj.hasOwnProperty("error")) {
        logE("Error from phantom server:", obj.error);
        logToErrorFile("error from phantom server");
        process.exit(20);

    } else {
        timestamp = obj.timestamp;
        sessionID = obj.sessionID;
    
        logI("Timestamp:", timestamp, "- SessionId:", sessionID);
    }
}

var refresher;
function connectionRefresher() {
    refresher = setInterval(() => {
        logI("Refreshing the connection...");
        request({
            url: "http://localhost:4230/",
            method: "POST",
            body: "refresh"
        }, (err, res, body) => {
            if (err) {
                logE("Error:", err);
            }
        });
    }, 25 * 1000); // 25 sec
}

function endConnection() {
    if (refresher) clearInterval(refresher);
    logI("Ending the connection...");

    return new Promise((resolve, reject) => {
        request({
            url: "http://localhost:4230/",
            method: "POST",
            body: "close"
        }, (err, res, body) => {
            if (err) {
                logE("Error:", err);
                reject(err);
            }
            resolve();
        });
    });
}

function setRootNames() {
    logI("Getting and setting root names from config string...");
    
    return new Promise((resolve, reject) => {
        sendRequestToADE(ADE.methods.getConfiguration, ADE.methods.getConfiguration.getPayload(), (body) => {
            setRootNamesFromConfig(body);
            resolve();  
        }, (error) => {
            logE("error", error.toString(), error);
            reject(error); 
        });
    });
}

async function scrapArborescence(startObj) {
    logI("Scraping Arborescence...");

    fs.writeFileSync(ARBO_FILE_PATH, "", "utf8"); // reset

    let queue = [],
        file,
        contents,
        filesNumber = 0;
        start = new Date();

    if (startObj === null) {
        queue.push(ADE.folders.rootObj);
    } else {
        queue.push(startObj);
    }

    while (file = queue.shift()) { // on parcourt la queue à l'envers
        if (file.isFolder) {
            try {
                contents = await new Promise((resolve, reject) => {
                    sendRequestToADE(ADE.methods.getChildren, ADE.methods.getChildren.getPayload(file, -1, -1),
                        (body) => {
                            resolve(decryptGetChildrenResponse(body));
                        },
                        (error) => { reject(error); }
                    );
                });
            } catch (e) {
                logE("An error occured when requesting for contents of folder: ", file, "\nThe error:" + e.toString(), e);
                logToErrorFile("error for scrap arborescence");
                throw e;
            }

            if (contents.childrenNumber > 0 && contents.childrenNumber !== contents.children.length) {
                // on n'a pas eu tous les children, car il y a plus de 150 children
                while (contents.children.length < contents.childrenNumber) {
                    logI("Getting the rest of the children (" + contents.children.length + " out of " + contents.childrenNumber + ")");
                    try {
                        contents.children.push(...(await new Promise((resolve, reject) => { // append to the children list the next chilren
                            sendRequestToADE(ADE.methods.getChildren, ADE.methods.getChildren.getPayload(file, contents.children.length, contents.children.length + 149 > contents.childrenNumber ? contents.childrenNumber : contents.children.length + 149),
                                (body) => {
                                    resolve(decryptGetChildrenResponse(body));
                                },
                                (error) => { reject(error); }
                            );
                        })).children);
                    } catch (e) {
                        logE("An error occured when requesting for contents of folder: ", file, "\nThe error:" + e.toString(), e);
                        logToErrorFile("error for scrap arborescence");
                        throw e;
                    }
                }
                logI("Got all children of " + file.fileNumber);
            }

            if (contents.childrenNumber > 0) {
                queue.unshift(...contents.children); // les children sont ajoutés dans l'ordre au début de la queue
            }
        }

        if (file.fileNumber < 0 && file.fileNumber !== -100) {
            // root folder -> on doit traduire son nom
            if (ADE.folders.categoriesNames.hasOwnProperty(file.name)) {
                file.name = ADE.folders.categoriesNames[file.name];
            } else {
                logE("Unknown category:", file.name);
            }
        }

        //log("Scraped file n°" + file.fileNumber + " - children: " + file.childrenNumber + " - address: " + file.address, "\n", file);

        // <n°fichier/dossier>|autant de tabulations que la profondeur du fichier/dossier|(préfixe '_' si c'est un fichier)<nom du fichier/dossier>\n
        fs.appendFileSync(ARBO_FILE_PATH, file.fileNumber + "\t".repeat(file.deepness + 1) + (file.isFolder ? "" : "_") + file.name + '\n', "utf8");
        
        filesNumber++;
        if (filesNumber % 100 === 0) {  // TODO : DEBUG
            logI(filesNumber);
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    logI("Done scraping the arborescence in " + (new Date() - start) + " ms, for " + filesNumber + " files.");
}

/*
 * regex pour à la fois vérifier si la répsonse d'ADE est positive et bien formattée, qui capture le hash (ou autre) en option de l'url, après le '=' (\x3D dans l'url) et avant le dernier '"'
 */
const urlFinder = /\/\/OK\[1,\[".+\\x3D(.+)"].+]/; // 
async function getUrlOfFile(fileID, timestampStart, timestampEnd) {
    return await new Promise((resolve, reject) => {
        sendRequestToADE(ADE.methods.getGeneratedUrl, ADE.methods.getGeneratedUrl.getPayload(fileID, timestampStart, timestampEnd),
            (body) => {
                let m = urlFinder.exec(body);
                if (m !== null) {
                    logI("Url pour " + fileID + ": " + m[1]);
                    resolve(m[1]);
                } else {
                    logI("Impossible d'obtenir l'url pour " + fileID + ", réponse: " + body);
                    reject(new Error("Error Url for " + fileID));
                }
            },
            (error) => { reject(error); }
        );
    });
}

async function dlFile(fileNb, fileUrl, fileName) {
    logI("Downloading " + fileNb + "...");

    const start = new Date();

    const file = await new Promise((resolve, reject) => {
        request({
            method: "GET",
            url: ADE.urls.dlUrl + fileUrl,
            gzip: true,
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive'
            },
        }, (err, res, body) => {
            if (err) {
                logE("Error when requesting " + fileNb + " :", err);
                logE("Body:\n", body);
                logToErrorFile("error for dlFiles " + fileNb);
                reject("Error when requesting " + fileNb);
            }
            resolve(body);
        });
    });

    fs.writeFileSync("edt_out/" + fileName + ".ics", file, "utf8");

    logI("Saved " + fileNb + " to " + fileName + ".ics , in " + (new Date() - start) + " ms");
}


/*
 * ADE helpers functions
 */

/**
 * Envoie une requête GWT à ADE pour la méthode précisée.
 * Timeout de 5 secondes pour chaque requête.
 * @param {Method} method 
 * @param {String} payload 
 * @param {function} callback       fonction prenant 1 argument, le body retourné par ADE
 * @param {function} errorCallback  function prenant 1 argument, le message d'erreur
 */
function sendRequestToADE(method, payload, callback, errorCallback) {
    const timeout = setTimeout(() => { errorCallback("Timeout for request of " + method.name); }, 5000);

    logI("payload:", payload); // TODO : debug (DELET)

    request({
        url: ADE.urls.GWT + method.proxy.name,
        method: "POST",
        headers: ADE.getHeaders(),
        body: payload

    }, (err, res, body) => {
        clearTimeout(timeout);
        if (err) {
            logE("Error:", err);
            logE("Body:\n", body);
            logToErrorFile("error for ade requests " + method.name);
            errorCallback("Error when requesting " + method.name);
        } else {
            callback(body);
        }
    });
}

function decryptGetChildrenResponse(res) {
    res = res.replace(/\\\"/g, '"'); // \" -> "

    if (!res.startsWith("//OK"))  {
        // erreur
        logE("Response from GetChildren is not positive!", res);
        logToErrorFile("error for children parser");
        return;
    }

    let i = 0, char = '\0', responseObj = {};

    // on lit la réponse jusqu'à trouver le début du string contenant les objets sérialisés
    while (char !== '"') { char = res[i++]; }

    function readString() {
        let value = "";
        char = res[i++];
        if (char !== '"') {
            // erreur: ce n'est pas le début d'un string
            logE("Incorrect start of string at " + i + ", expected \".", "\n    " + res.substr(i - 10, 20) + "\n              ^");
            logToErrorFile("error for children parser");
            return "";
        }

        while (true) {
            char = res[i++];
            if (char === '"') break;
            value += char;
        }

        // superb log output
        //log("Read string: '" + value + "' at " + (i - value.length) + "." , "\n    " + res.substr(i - 10 - value.length, 20 + value.length) + "\n    " + " ".repeat(8) + "^" + " ".repeat(value.length) + "^");

        return value;
    }

    function readArrayDef() {
        let value = "";
        char = res[i++];
        if (char !== '[') {
            // erreur: ce n'est pas le début d'une définition d'une array
            logE("Incorrect start of array definition at " + i + ", expected [.",  "\n    " + res.substr(i - 10, 20) + "\n              ^");
            logToErrorFile("error for children parser");
            return -1;
        }

        while (true) {
            char = res[i++];
            if (char === ']') break;
            value += char;
        }

        return Number.parseInt(value);
    }

    function readFieldObject() {
        /*
        {           --> objet field
                            "ColorField"    --> type de field
                            "COLOR"         
                            "LabelColor"    --> sous-type?
                            "255,255,255"   --> valeur
                            "false"
                            "false"
        */
        char = res[i++];
        if (char !== '{') {
            logE("incorrect start of field object at " + i + ", expected {.");
            logToErrorFile("error for children parser");
            return {};
        }
        let type = readString(); 
        readString();
        readString();
        let field = new FieldObject(type, readString());
        readString(); readString();
        return field;
    }

    function readFileObject() {
        let obj = {};

        char = res[i++];
        if (char !== '{') {
            logE("incorrect start of file object at " + i + ", expected {.");
            logToErrorFile("error for children parser");
            return {};
        }

        obj.fileNumber = Number.parseInt(readString());
        obj.isFolder = (readString() === "true");
        obj.deepness = Number.parseInt(readString());
        obj.childrenNumber = Number.parseInt(readString());

        readString(); readString(); readString(); readString(); // unknown values
        
        let fieldObjects = readArrayDef(); // fields array
        for (let i = 0; i < fieldObjects; i++) {
            let fieldObj = readFieldObject();
            if (fieldObj.type === "StringField") { // consider only string fields, as they contain the name of the folder/file
                obj.name = fieldObj.value;
            }
        }
        
        obj.address = readString();
        obj.rootName = readString();
        
        readString(); readString(); // unknown values
        readArrayDef(); readArrayDef(); // always empty arrays def 

        if (obj.childrenNumber >= 0) {
            let arrSize = readArrayDef();
            if (arrSize != obj.childrenNumber) {
                logE("Children number (" + obj.childrenNumber + ") is different from the declared array size (" + arrSize + ") at " + i);
            }
            obj.children = [];
            for (let x = 0; x < arrSize; x++) {
                obj.children.push(readFileObject());
            }
        }

        return new FileObject(obj);
    }

    // start reading

    char = res[i++];
    if (char === '{' && readString() === '0') {
        // start of root object
        responseObj = readFileObject();
    
        //log("End of response: '" + res.substr(i) + "'");
        //log("response obj: ", responseObj.toString());

    } else {
        logE("wat is this");
        logE(res.substr(i-5, i+6), "\n     ^");
        logE("Complete body:", res);
        logToErrorFile("error for children parser");
        throw new Error("Error when parsing response.");
    }

    return responseObj;
}

const configFinder = /(type\.Category[0-9]+)\\"\\"(.*?)\\"/gu;
/**
 * cherche les noms des dossiers root à partir de la liste de tous les string d'ADE et leur valeur
 * @param {string} config : un string de ~2.6 Mo, donc on doit faire des recherches efficaces
 */
function setRootNamesFromConfig(config) {
    let typeConfigRange = config.substr(245500, 1000), 
        m,
        i = 0, 
        categories = {};
    
    while ((m = configFinder.exec(typeConfigRange)) !== null) {
        if (m.index === configFinder.lastIndex)
            configFinder.lastIndex++;
        
        m.forEach((match, groupIndex) => {
            if (groupIndex === 1)
                categories[i = match] = undefined;
            else if (groupIndex === 2)
                categories[i] = match;
        });
    }
    
    if (categories.length === 0) {
        logE("Error: could not retrieve categories names with the fast method. Trying the slow one...");
        i = 0;
        while ((m = configFinder.exec(config)) !== null) {
            if (m.index === configFinder.lastIndex)
                configFinder.lastIndex++;
            
            m.forEach((match, groupIndex) => {
                if (groupIndex === 1)
                    categories[i = match] = undefined;
                else if (groupIndex === 2)
                    categories[i] = match;
            });
        }

        if (categories.length === 0) {
            logE("Error: slow method didn't work either. Aborting...\nConfig str:", config.substr(0, 1000), "\n...");
            logToErrorFile("error for get root names");
            throw new Error("Could not retrieve categories names from config string.");
        }
    }

    ADE.folders.categoriesNames = categories;
    logI("Successfully set categories names:", categories);
}

/*
 * Main functions
 */

function initADEPhantomSession() {
    launchPhantomServer();
    
    return new Promise((resolve, reject) => {
        logI("Waiting for ADE...");
        const waitForADEFail = setTimeout(() => { reject("Timeout for ADE load."); }, 60 * 1000); // 1 min
        const waitForADEload = setInterval(() => {
            if (timestamp !== undefined && sessionID !== undefined) {
                logI("ADE ready.");
                clearTimeout(waitForADEFail);
                clearInterval(waitForADEload);
                connectionRefresher();
                resolve();
            }
        }, 10); // 10 ms
    });
}

async function dlFiles(file) {
    const fileList = fs.readFileSync(file, "utf8").split('\n').map(s => s.trim());

    logI("Downloading " + fileList.length + " files...");

    let fileCID, fileID, fileURL, fileAddress;
    for (const fileInfo of fileList) {
        if (fileInfo.length == 0) {
            logI("Empty line.");
            continue; // fin de fichier / ligne vide
        }

        [fileCID, fileURL, fileAddress] = fileInfo.split(' ', 2);
        fileID = fileCID.substring(2, fileCID.length - 2);

        if (fileURL.length <= 16) {
            // décompactage de l'url
            fileURL = ADE.fileUrls.prefix + fileURL + ADE.fileUrls.suffix[fileID.length];
        }

        await dlFile(fileID, fileURL, fileCID);
    }

    logI("Done downloading " + fileList.length + " files.");
}

async function getUrls(file, before, after) {
    const fileList = fs.readFileSync(file, "utf8").split('\n').map(s => s.trim().split(' ', 1));
    
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth());

    logI("Getting urls of " + fileList.length + " files, from " + before + " months before to " + after + " after.");

    const beforeStamp = await dateToBase64WithoutJavaShitButJava(thisMonth.setMonth(thisMonth.getMonth() - before)); // subtract 'before' months
    const afterStamp = await dateToBase64WithoutJavaShitButJava(thisMonth.setMonth(thisMonth.getMonth() + before + after)); // add 'after' months

    fs.writeFileSync(URLS_FILE_PATH, "", "utf8"); // reset file (and create it)

    let url, fileID;
    for (const [fileCID, address] of fileList) {
        if (fileCID.length == 0) {
            logI("Empty line.");
            continue; // fin de fichier / ligne vide
        }
        
        fileID = fileCID.substring(2, fileCID.length - 2);

        url = await getUrlOfFile(fileID, beforeStamp, afterStamp);

        if (url instanceof Error || !url) {
            logE("Error when getting the url of " + fileCID + " of address: '" + address + "' :", url);
            logToErrorFile("error for get url " + fileCID);
            continue;
        }

        let suffix;
        if (url.startsWith(ADE.fileUrls.prefix)) {
            if (fileID.length == 2 && fileID.startsWith('-')) {
                suffix = ADE.fileUrls.rootSuffix; // root file
            } else {
                suffix = ADE.fileUrls.suffix[fileID.length];
            }
        }

        if (suffix === undefined || !url.endsWith(suffix)) {
            logE("The url of the file " + fileCID + " doesn't match the usual syntax: " + url); // TODO : ajouter à un log important, ou un message
            fs.appendFileSync(URLS_FILE_PATH, fileCID + ' ' + url + '\n', "utf8");
        } else {
            fs.appendFileSync(URLS_FILE_PATH, fileCID + ' ' + url.substring(ADE.fileUrls.prefix.length).replace(suffix, '') + '\n', "utf8");
        }
    }

    logI("Done getting urls of " + fileList.length + " files.");
}

/**
 * args:
 *  -dlFiles <path vers un fichier contenant la liste des fichiers à dl>
 *      Format du fichier: <id du fichier> <url compact | url complète>
 *      ex: 11903 8241fc38732002149fc088ab5d12396fbd72d825015315fe78f9cc...
 *          ou
 *          11903 9fc088ab5d12396f
 *      Tous les fichiers téléchargés vont dans le dossier '/edt_out', dans un fichier propre à chaque téléchargement nommé avec l'id du fichier
 *      On n'ouvre pas une session ADE avec phantomjs pour cette opération
 * 
 *  -arboscrap [_|<id complète du dossier de départ>] <path vers le fichier out> : 
 *      Scrap l'arborescence d'ADE, en partant du dossier de l'arborescence précisé par son addresse (avec en préfixe l'index de la root et en suffixe sa profondeur), ce qui est optionnel
 *      ex: -arboscrap 1_11903_4 arbo_out.txt
 *          -arboscrap _ arbo_out.txt
 * 
 *  -urls <path vers un fichier contenant la liste des fichiers> <nb de mois avant> <nb de mois après>
 *      Demande l'url pour tous les fichiers spécifiés.
 *      Format du fichier: <id du fichier>
 *      Les offsets des mois précisent à quelle plage de temps des emplois du temps l'url va faire référence
 *      Toutes les urls sont mises dans un fichier nommé 'urls_out.txt', qui a comme format: <id du fichier> <url compressée | url complète (>16 caractères)>
 *      Les erreurs sont listées dans le fichier 'urls_errors.txt', du type <timestamp> <id du fichier>
 *      ex: -urls file_list.txt 2 6
 */
function main() {
    let args = process.argv.slice(2),
        i,
        file,
        start,
        chain = [];

    // parse arguments

    if ((i = args.indexOf("-dlFiles")) >= 0) {
        if (i + 1 >= args.length) {
            process.stderr.write("Not enough arguments for 'dlFiles'\n");
            process.exit(20);
        }
        file = args[i + 1];

        if (!fs.existsSync(CONFIG.Request.EDT_OUT_DIR)) {
            logI("Creating the folder edt_out...");
            fs.mkdirSync(CONFIG.Request.EDT_OUT_DIR);
        }
        
        chain.push(async () => { return await dlFiles(file); });
    }

    if ((i = args.indexOf("-arboscrap")) >= 0) {
        if (i + 2 >= args.length) {
            process.stderr.write("Not enough arguments for 'arboscrap'\n");
            process.exit(20);
        }
        start = args[i + 1];
        ARBO_FILE_PATH = args[i + 2];
        if (start === '_') {
            start = null;
        } else if (!start.match(/[0-9]_-?[0-9]+_[0-9]/)) {
            // incorrect format
            process.stderr.write("Incorrect format: '" + start + "'");
            process.exit(20);
        } else {
            start = new FileObject({
                fileNumber: Number.parseInt(start.substr(2, start.length - 4)),
                isFolder: true,
                deepness: Number.parseInt(start.substr(start.length - 1, 1)),
                rootName: ADE.folders.categoriesInternalNames[Number.parseInt(start.substr(0, 1))]
            });
        }

        chain.push(initADEPhantomSession);
        chain.push(async () => { return await scrapArborescence(start); });
    }

    if ((i = args.indexOf("-urls")) >= 0) {
        if (i + 3 >= args.length) {
            process.stderr.write("Not enough arguments for 'urls'\n");
            process.exit(20);
        }

        file = args[i + 1];

        if (chain.length < 2) {
            chain.push(initADEPhantomSession); // make sure that phantom is running before scraping
        }
        chain.push(async () => { return await getUrls(file, Number.parseInt(args[i + 2]), Number.parseInt(args[i + 3])); });
    }

    // execute tasks

    if (chain.length > 0) {
        process.stdout.write("Working...\n");

        if (chain.length > 1) // if we started an ADE session, close the connection
            chain.push(async () => { return await endConnection(); });
		
		let error = false;
		
        chain.push(() => { process.stdout.write("Done.\n"); 
                           process.exit(error ? 20 : 0); });

        chain.reduce((previous, current) => { // perform all tasks in order
            return previous.then(current)
                           .catch((reason) => {
                               logE("Error :", reason);
							   error = true;
                           });
        }, Promise.resolve());
        
    } else {
        process.stdout.write("Nothing to do.\n");
    }
}

main();
