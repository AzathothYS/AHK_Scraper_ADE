# coding=UTF-8

import os
import sys
from traceback import format_exc
from datetime import datetime
import json
from pathlib import Path

ARBORESCENCE_FILE = "arborescence.txt"
SUMMARY_FILE = "summary.txt"
UPDATE_FILE = "updateLog.txt"
REQUESTS_FILE = "requests.txt"
EDT_DIR = Path("EdTOut/")
DATABASE_DIR = Path("Database/")
BACKUP_DIR = Path("Database/$Backups") # TODO

IS_IN_TERMINAL = sys.stdout.isatty()

REPLACEMENTS = {
    '/': '---00R---',  # NB: il n'y a pas de '\' dans l'arborescence
    '.': '---01R---',
    ':': '---02R---',
    '"': '---03R---',
    '*': '---04R---',
    '?': '---05R---',
    '<': '---06R---',
    '>': '---07R---',
    '|': '---08R---'
}

EXCLUDED_DIRS = [
    BACKUP_DIR.name
]

summary = {}

updates = []

updatesOutput : str

REMOVE_ICS_FILES = True



def updateDatabase():
    # on met à jour la database avec les fichiers **.json dans EdTOut/

    # récupération des requests
    with open(REQUESTS_FILE, "r") as requestsFile:
        requests = requestsFile.readlines()

    requests = [req[1:-1] for req in requests]  # suppression des fins de lignes '\n' et du '/' au début de chaque requête

    # ordonnation des requêtes pour quelles correpondent à l'ordre de 'edtList'
    requests = orderRequests(requests)

    # remplacement de tous les caratères interdits pour les dossiers et fichiers
    for i, request in enumerate(requests):
        requests[i] = nameToStorageName(request)

    log("updateDatabase", "Requests: " + str(requests))

    # liste de tous les fichiers à mettre à jour
    edtList = sorted(EDT_DIR.glob("*.json"))

    if len(edtList) != len(requests):
        log("updateDatabase", "Different number of requests and EdT! {} != {}".format(len(requests), len(edtList)), True)
        raise IndexError()

    for edtFile, request in zip(edtList, requests):
        req_folder, sep, req_file = request.rpartition('/')
        req_path = DATABASE_DIR / req_folder
        req_file_path = req_path / (req_file + ".json")

        # log("updateDatabase", "Processing '" + request + "' and edt file: '" + str(edtFile) + "'")

        # ouverture du fichier à déplacer pour obtenir les infos stockées dans le dernier élément de la liste json
        with edtFile.open("r", encoding="UTF-8") as edt:
            edt_info = json.load(edt)[-1]  # type:dict

        if not req_path.exists():
            # création du dossier parent
            req_path.mkdir(parents=True)
            log("updateDatabase", "Created '" + str(req_path) + "'")

            last_update = "0"

        elif not req_file_path.exists():
            # le dossier parent existe mais pas le fichier
            last_update = "0"

        else:
            # on récupère les infos précédantes pour ensuite les mettre à jour
            edt_info_prev = getFromSummary(request)

            if not edt_info_prev:
                # clé non présente dans le summary
                last_update = "0"
            else:
                try:
                    if edt_info_prev["file_sum"] == edt_info["file_sum"]:
                        # les checksums sont égaux, pas d'update à faire
                        log("updateDatabase", "File '{}' is already up to date".format(req_file_path))

                        # on supprimme le fichier dans 'EdTOut'
                        os.remove(str(edtFile))

                        continue

                except KeyError as e:
                    log("updateDatabase", "Could not compare checksums for file '{}': edt_info_prev={} - edt_info={}"
                        .format(req_file_path, "_sum" in edt_info_prev, "_sum" in edt_info), True)
                    raise e

                last_update = edt_info_prev["last_update"]


        updateLog(request, last_update)
        updateSummary(request, checksum=edt_info["file_sum"], trueName=edt_info["source_file"])

        edtFile.replace(req_file_path)  # déplacement du fichier vers la database

    log("updateDatabase", "Done.")

def orderRequests(requests: list) -> list:
    req_order = []
    with open("path.txt", "r", encoding="UTF-8") as pathFile:
        pathIter = pathFile.readlines().__iter__()
        for cmd in pathIter:
            if cmd == "GET_EDT\n":
                # la ligne suivante est le nom du fichier, on exclut la fin de ligne '\n' et la marque de fichier '__' du début
                req_order.append(pathIter.__next__()[2:-1])

    ordered_requests = []
    for target_file in req_order:
        for request in requests: #type: str
            if request.endswith(target_file):
                #log("orderRequests", "'{}' matched with '{}'".format(request, target_file))
                ordered_requests.append(request)
                break

    #log("orderRequests", "Final ordered requests: " + str(ordered_requests))

    return ordered_requests


def cleanDatabase():
    # TODO
    pass


def verifyDatabase():
    # on parcourt l'arbo et le summary en même temps que la database pour voir si tout correspond ou pas

    # comparaison entre l'arborescence d'ADE stockée et le sommaire de la database
    arbo_errors = 0
    with open(DATABASE_DIR / ARBORESCENCE_FILE, "r", buffering=1, encoding="UTF-8") as arbo: # buffering par ligne
        line = arbo.readline()

        for entry, level in iterateThroughSummary(summary, outputDeepness=0):
            entryInArbo = storageNameToName(entry, isPathLike=False)
            while not compareFromLine(line, entryInArbo):
                line = gotoNextFolder(arbo, level)
                if not line:
                    # on a atteint la fin de l'arborescence ou un dossier plus haut
                    log("verifyDatabase", "Impossible de trouver '{}' dans l'arborescence!".format(entry), True)
                    arbo_errors += 1
                    break

            if arbo_errors > 0:
                break


    # comparaison entre le sommaire de la database et la database
    database_errors = 0
    gen_summary = iterateThroughSummary(summary, outputFileInfo=True)
    gen_database = iterateThroughDatabase()
    for entry_summary, entry_database in zip(gen_summary, gen_database):
        if type(entry_summary) is dict:
            if entry_database["file_sum"] != entry_summary["file_sum"]:
                log("verifyDatabase", "Le checksum de la database et du summary sont différents pour '{}' ('{}')"
                    .format(entry_summary["true_name"], entry_database["source_file"]), True)
                database_errors += 1

        elif entry_summary != entry_database:
            log("verifyDatabase", "La database et le summary ne coïncident pas! Voulu: '{}' eu '{}'"
                .format(entry_summary, entry_database), True)
            database_errors += 1
    try:
        if database_errors == 0 and (gen_summary.__next__() != None or gen_database.__next__() != None):
            log("verifyDatabase", "La taille de la database et du summary ne correspondent pas!")
            database_errors += 1
    except StopIteration:
        pass


    # TODO : envoyer un message à l'ADMIN pour chaque erreur
    if arbo_errors == 0 and database_errors > 0:
        log("verifyDatabase", "La database est corrompue!")
        raise Exception("La database est corrompue. {} erreurs trouvées.".format(database_errors))

    elif arbo_errors > 0 and database_errors == 0:
        log("verifyDatabase", "L'arborescence est corrompue!")
        raise Exception("L'arborescence est corrompue! {} erreurs trouvées.".format(arbo_errors))

    elif arbo_errors > 0 and database_errors > 0:
        log("verifyDatabase", "Le summary est corrompu!")
        raise Exception("Le summary est corrompu! {} erreurs trouvées dans l'arborescence et {} erreurs trouvées dans la database.".format(arbo_errors, database_errors))

    else:
        log("verifyDatabase", "Aucune erreur trouvée.")


def removeIcsFiles():
    icsList = sorted(EDT_DIR.glob("*.ics"))

    for icsPath in icsList:
        os.remove(str(icsPath))

    log("removeIcsFiles", "Removed ics files.")


def getUpdates():

    # TODO : à refaire mais en mieux
    # actuellement ne fait qu'une simple liste des fichiers déjà présents dans la database

    toUpdate = []

    for file in DATABASE_DIR.glob("**/*.json"):
        fileStr = str(file.relative_to(DATABASE_DIR))[:-5]
        fileStr = storageNameToName(fileStr, isPathLike=True)
        fileStr = fileStr.replace("\\\\", "\\")

        toUpdate.append(fileStr)

    log("getUpdates", "Got {} files to update.".format(len(toUpdate)))

    with open(REQUESTS_FILE, mode="w", encoding="UTF-8") as requests:
        for request in toUpdate:
            requests.write(request + "\n")

    log("getUpdates", "Outputted to " + REQUESTS_FILE)


# ------------------------------------------------
# Fonctions utilitaires pour manipuler la database
# ------------------------------------------------

# exemple d'un summary d'un fichier:
# {
#   file_sum: "36540554354643"
#   true_name: "exemple"
#   last_update: "2018-06-01 20:02"
# }


def nameToStorageName(name : str, isPathLike = True) -> str:
    storageName = name
    for char in name:
        if char in REPLACEMENTS and ((isPathLike and char is not '/') or not isPathLike):
            storageName = storageName.replace(char, REPLACEMENTS[char])

    if '$%$' in name: # caractère de remplacement utilisé par 'makePathFileFromRequest' pour '/'
        storageName = storageName.replace('$%$', REPLACEMENTS['/'])

    return storageName

def storageNameToName(storageName : str, isPathLike = True) -> str:
    name = storageName

    if REPLACEMENTS['/'] in storageName:
        name = name.replace(REPLACEMENTS['/'], '$%$')

    for keyChar, replacementChars in REPLACEMENTS.items():
        if replacementChars in storageName:
            name = name.replace(replacementChars, keyChar)

    if isPathLike and "$%$" in name:
        name = name.replace("$%$", "/") # pour gérer les path complets du type: 'grg/rgr/grgr/rgrg/grg'

    return name


def iterateThroughDatabase(start = DATABASE_DIR) -> str or dict:
    for obj in start.iterdir():
        if obj.is_dir():
            if obj.name in EXCLUDED_DIRS:
                continue

            yield str(obj.name)
            yield from iterateThroughDatabase(obj)

        else:
            if obj.suffix != ".json": # ce n'est pas un fichier de l'arborescence
                continue

            yield str(obj.stem) # juste le nom du fichier, sans l'extension

            with open(obj, "r", buffering=1, encoding="UTF-8") as file:
                yield json.load(file)[-1] # output file info, toujours à la fin du fichier

def iterateThroughSummary(summaryPart : dict, outputFileInfo = False, outputDeepness = -1) -> str or dict:
    if outputDeepness >= 0:
        for key, contents in summaryPart.items():
            yield key, outputDeepness
            if "file_sum" not in contents:  # on ignore le contenu des fichiers dans le summary
                yield from iterateThroughSummary(contents, outputFileInfo, outputDeepness + 1)
            elif outputFileInfo:
                yield contents  # on veut utiliser les infos des fichiers
    else:
        for key, contents in summaryPart.items():
            yield key
            if "file_sum" not in contents:  # on ignore le contenu des fichiers dans le summary
                yield from iterateThroughSummary(contents, outputFileInfo)
            elif outputFileInfo:
                yield contents  # on veut utiliser les infos des fichiers


def compareFromLine(line : str, name : str) -> bool:
    return line.__contains__(name)

def getIndentOfLine(line : str) -> int:
    return line.count("    ")

def gotoNextFolder(file, indent : int) -> str or bool:
    line = file.readline()
    lineIndent = getIndentOfLine(line)

    while lineIndent > indent:
        line = file.readline()
        if line == '': # EOF
            return False

        lineIndent = getIndentOfLine(line)
        if lineIndent < indent:
            # on a dépassé la cible
            return False

    return line


def updateLog(path: str, prev_update: str):
    entry = {
        "path": path,
        "prev_update": prev_update,
        "update": getTime(),
        "true_name": storageNameToName(path, True)
    }

    updates.append(entry)


def saveUpdateLog():
    with (DATABASE_DIR / UPDATE_FILE).open("w", encoding="UTF-8") as updateFile:
        json.dump(updates, updateFile, ensure_ascii=False, indent="\t")

    log("saveUpdateLog", "Saved update log.")



def getFromSummary(path: str) -> dict:
    get = summary
    for folder in path.split('/'):
        try:
            get = get[folder]
        except KeyError:
            return {}

    return get


def updateSummary(path: str, isFile = True, checksum = None, trueName = None):
    folders = path.split('/')

    if isFile:
        # création de l'entrée du fichier
        if trueName is None:
            trueName = folders[-1]
            for rep, char in REPLACEMENTS.items():
                if rep in trueName:
                    trueName = trueName.replace(rep, char)

        update = {folders[-1]: {
            "file_sum": checksum,
            "true_name": trueName,
            "last_update": getTime()
        }}

    else:
        # renommage / création de dossiers
        update = folders[-1]

    for folder in folders[-2::-1]:
        update = {folder: update}

    recursive_update(summary, update)

    log("updateSummary", "Updated '" + path + "' of true name: " + trueName)

def recursive_update(d : dict, update : dict) -> None:
    for key, item in update.items():
        if key in d:
            recursive_update(d[key], item)
        else:
            d.update({key : item})


def loadSummary():
    global summary
    sum_path = DATABASE_DIR / SUMMARY_FILE

    if sum_path.exists():
        with sum_path.open("r", encoding="UTF-8") as summaryFile:
            summary = json.load(summaryFile)


def saveSummary():
    with (DATABASE_DIR / SUMMARY_FILE).open("w", encoding="UTF-8") as summaryFile:
        json.dump(summary, summaryFile, indent="\t", ensure_ascii=False)

    log("saveSummary", "Sucessfully saved new summary")


# ----------------------------------------


def getTime() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def log(tag: str, text: str, error=False):
    if error:
        logFile.write("\n{}\t- database:\t{}:\tERROR - {}".format(getTime(), tag, text))
    else:
        logFile.write("\n{}\t- database:\t{}:\tINFO  - {}".format(getTime(), tag, text))

    if IS_IN_TERMINAL:
        print("{} \t {} - {}".format(tag, "ERROR" if error else "INFO", text))


def parseArgs():
    if len(sys.argv) == 1:
        # affichage de l'aide dans le terminal
        print("Outil d'édition de la database des Emplois du temps d'ADE :\n" +
              "\t-update\t\t\tmet à jour la database avec les fichiers NN.json stockés dans 'EdTOut/',\n\t\t\t\tliste toutes les mises à jour dans '" + UPDATE_FILE + "'\n" +
              "\t-clean\t\t\tnettoie la database des fichiers trop anciens ou pas utilisés\n" +
              "\t-verify\t\t\tvérifie la correspondance entre les dossiers de la database et le dernier\n\t\t\t\tfichier de l'arborescence d'ADE stocké\n" +
              "\t-getUpdates file\técrit dans 'file' la liste des emplois du temps présents dans\n\t\t\t\tla database à metre à jour\n")
        return

    log("ParseArgs", "Started with params: " + str(sys.argv))

    args_it = sys.argv[1:].__iter__()
    for arg in args_it:
        if arg == "-debug":
            global REMOVE_ICS_FILES
            REMOVE_ICS_FILES = False

        elif arg == "-update":
            loadSummary()

            updateDatabase()

            saveUpdateLog()
            saveSummary()

            if REMOVE_ICS_FILES:
                removeIcsFiles()

            verifyDatabase()

        elif arg == "-clean":
            loadSummary()

            cleanDatabase()

            saveSummary()

            verifyDatabase()

        elif arg == "-verify":
            loadSummary()

            verifyDatabase()

        elif arg == "-getUpdates":
            try:
                global updatesOutput
                updatesOutput = args_it.__next__()

            except StopIteration:
                print("Vous n'avez pas spécifé de fichier!")
                exit(0)

            else:
                getUpdates()

        else:
            log("ParseArgs", "Invalid parameter: '" + arg + "'", True)



def test():
    log("main", "TEST MODE")

    getUpdates()





if __name__ == '__main__':
    with open("log.txt", "a") as logFile:
        try:
            log("main", "Started.")

            if True:
                test()
            else:
                parseArgs()

            log("main", "Finished.")

        except Exception:
            log("main", format_exc() + "\ndatabase failed!\n", True)
            sys.stdout.write("ERROR")
        else:
            sys.stdout.write("OK")
