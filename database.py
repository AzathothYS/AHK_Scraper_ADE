# coding=UTF-8

import os
import sys
from traceback import format_exc
from datetime import datetime
import json
from pathlib import Path

WORKING_DIR = Path("C:/Users/7/Documents/Travail/Univ/App Univ/AHK_Scraper_ADE/")

ARBORESCENCE_FILE = "arborescence.txt"
SUMMARY_FILE = "summary.txt"
UPDATE_FILE = "updateLog.txt"
REQUESTS_FILE = "requests.txt"
EDT_DIR = Path("EdTOut/")
DATABASE_DIR = Path("Database/")
BACKUP_DIR = Path("Database/$Backups")  # TODO

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

updatesOutput: str

REMOVE_ICS_FILES = True



def updateDatabase():
    # on met à jour la database avec les fichiers **.json dans EdTOut/

    requests = loadRequests()

    # remplacement de tous les caratères interdits pour les dossiers et fichiers
    for i, request in enumerate(requests):
        requests[i] = nameToStorageName(request)

    log("updateDatabase", "Requests: " + str(requests))

    # liste de tous les fichiers à mettre à jour, dans l'ordre croissant de leur nom de fichier (qui est un numéro)
    edtList = sorted(EDT_DIR.glob("*.json"), key=lambda item: int(item.stem))

    log("updateDatabase", "Files: " + str(list(edtList)))

    if len(edtList) != len(requests):
        log("updateDatabase", "Different number of requests and EdT! {} != {}".format(len(requests), len(edtList)), True)
        raise IndexError()

    for edtFile, request in zip(edtList, requests):
        req_folder, _, req_file = request.rpartition('/')
        req_path = DATABASE_DIR / req_folder
        req_file_path = req_path / (req_file + ".json")

        # log("updateDatabase", "Processing '" + request + "' and edt file: '" + str(edtFile) + "'")

        # ouverture du fichier à déplacer pour obtenir les infos stockées dans le dernier élément de la liste json
        with edtFile.open("r", encoding="UTF-8") as edt:
            edt_info = json.load(edt)[0]  # type:dict

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

        updateLog(request, last_update, edt_info["file_sum"])

        # on regarde si l'emploi du temps est vide avant de mettre à jour le summary
        empty = False
        if (edtFile.stat().st_size) < 1000:
            # il se peut que se soit un EdT vide, on l'ouvre pour vérifier

            firstWeek: dict = json.loads(edtFile.read_text(encoding="UTF-8"))[1]
            if "empty" in firstWeek and firstWeek["empty"] == "true":
                # le fichier est vide
                empty = True

        updateSummary(request, checksum=edt_info["file_sum"], trueName=edt_info["source_file"], isEmpty=empty)

        edtFile.replace(req_file_path)  # déplacement du fichier vers la database

    log("updateDatabase", "Done.")

def loadRequests() -> list:
    # récupération des requests
    with open(REQUESTS_FILE, "r") as requestsFile:
        requests = requestsFile.readlines()

    # suppression des fins de lignes '\n' et du '/' au début de chaque requête
    requests = [req[(1 if req.startswith('/') else 0):(-1 if req.endswith('\n') else len(req))] for req in requests]

    # ordonnation des requêtes pour quelles correpondent à l'ordre de 'edtList'
    return orderRequests(requests)
# TODO : fusionner les 2
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
                    log("verifyDatabase", "Impossible de trouver '{} ({})' dans l'arborescence!".format(entryInArbo, entry), True)
                    arbo_errors += 1
                    break

            if arbo_errors > 0:
                break


    # comparaison entre le sommaire de la database et la database
    database_errors = 0
    gen_summary = iterateThroughSummary(summary, outputFileInfo=True)
    gen_database = iterateThroughDatabase()
    for entry_summary, entry_database in zip(gen_summary, gen_database): #type:dict, dict
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
        fileStr = fileStr.replace("/", "$%$").replace("\\", "/")

        toUpdate.append(fileStr)

    log("getUpdates", "Got {} files to update.".format(len(toUpdate)))

    with open(REQUESTS_FILE, mode="a", encoding="UTF-8") as requests:
        for request in toUpdate:
            requests.write(request + "\n")

    log("getUpdates", "Outputted to " + REQUESTS_FILE)



def makeRandRequests(nb:int):
    from random import randint

    with open(REQUESTS_FILE, mode="w", encoding="UTF-8") as requestFile,\
        open(DATABASE_DIR / ARBORESCENCE_FILE, mode="r", encoding="UTF-8", buffering=1) as arbo:

        while nb > 0:
            nb -= 1

            arbo.seek(3)

            req_str = ""

            indent = 0
            pos = 0
            while True:
                nbOfLinesInFolder = 0

                for line in arbo:
                    currentIndent = getIndentOfLine(line)
                    if currentIndent == indent:
                        nbOfLinesInFolder += 1
                    elif currentIndent < indent:
                        break # on est sortis du dossier

                if nbOfLinesInFolder - 1 <= 0:
                    choice = 0
                else:
                    choice = randint(0, nbOfLinesInFolder -1)

                arbo.seek(pos if pos >= 3 else 3)

                line = arbo.readline()
                while line: # on change de structure pour pouvoir utiliser 'tell'
                    currentIndent = getIndentOfLine(line)
                    if currentIndent == indent:
                        choice -= 1
                        if choice < 0:
                            pos = arbo.tell()

                            if not line.__contains__("__"): # comme c'est un dossier on vérifie qu'il n'est pas vide
                                nextLine = arbo.readline()
                                if getIndentOfLine(nextLine) <= indent:
                                    # le dossier sélectionné est vide
                                    log("makeRandRequests", "Trouvé un dossier vide. On recommence...", error=True)
                                    line = ''

                            indent += 1
                            break

                    elif currentIndent < indent:
                        # nous sommes sortis du dossier
                        log("makeRandRequests", "Impossible de trouver la cible dans le dossier.", error=True)
                        line = ''
                        break

                    line = arbo.readline()

                if not line:
                    if choice < 0:
                        nb += 1 # pour compenser et bien obtenir à la fin le nombre voulu de requests
                        break
                    else:
                        raise EOFError("Reached EOF while parsing " + ARBORESCENCE_FILE + " - Folder : " + req_str + " - indent: " + str(indent) + " - nbOfLinesInFolder: " + str(nbOfLinesInFolder) + " - choice: " + str(choice))


                line = line[getIndentOfLine(line) * 4:-1] # on supprimme la fin de ligne en plus de l'indentation

                if line.startswith("__"):
                    req_str += line[2:].replace('/', "$%$") # suppression du '__' au début et des éventuels '/'
                    requestFile.write(req_str + '\n')
                    log("makeRandRequests", "New request: " + req_str)
                    break
                else:
                    req_str += line.replace('/', "$%$") # replacement des '/' par '$%$'
                    req_str += '/'



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

    if '/' in storageName:
        name = name.replace('/', '$%$')

    for keyChar, replacementChars in REPLACEMENTS.items():
        if replacementChars in name:
            name = name.replace(replacementChars, keyChar)

    if isPathLike and "$%$" in name: # TOTRY
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
                yield json.load(file)[0] # output file info, toujours au début du fichier

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


def updateLog(path: str, prev_update: str, checksum: str):
    entry = {
        "path": path,
        "prev_update": prev_update,
        "update": getTime(),
        "true_name": storageNameToName(path[path.rindex('/') + 1:], False),
        "checksum": checksum
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


def updateSummary(path: str, isFile = True, checksum = None, trueName = None, isEmpty = False):
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
            "empty": isEmpty,
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
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(tag: str, text: str, error=False):
    tag:str = sys._getframe(1).f_code.co_name # TODO : supprimmer toutes les 'tags' si ça focntionne
    if tag == "<module>":
        tag = "root"

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
              "\t-update\t\t\tmet à jour la database avec les fichiers NN.json stockés dans 'EdTOut/',\n\t\t\t\t\tliste toutes les mises à jour dans '" + UPDATE_FILE + "'\n" +
              "\t-clean\t\t\tnettoie la database des fichiers trop anciens ou pas utilisés\n" +
              "\t-verify\t\t\tvérifie la correspondance entre les dossiers de la database et le dernier\n\t\t\t\t\tfichier de l'arborescence d'ADE stocké\n" +
              "\t-getUpdates\t\técrit dans 'requests.txt' la liste des emplois du temps présents dans\n\t\t\t\t\tla database à metre à jour\n" +
              "\t-makeRandomRequests n\técrit dans 'requests.txt' n requêtes aléatoires\n")
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
            getUpdates()

        elif arg == "-makeRandomRequests":
            try:
                n: str = args_it.__next__()
                assert n.isdigit()
            except StopIteration:
                print("Not enough parameters! Expected a number.")
                raise Exception("Not enough parameters.")
            except AssertionError:
                print("'{}' is not a number!".format(n))
                raise Exception("'{}' is not a number!".format(n))

            makeRandRequests(int(n))

        else:
            log("ParseArgs", "Invalid parameter: '" + arg + "'", True)
            raise Exception("Invalid parameter.")



def test():
    log("main", "TEST MODE")

    getUpdates()





if __name__ == '__main__':
    if Path(os.getcwd()) != WORKING_DIR:
        os.chdir(WORKING_DIR)

    with open("log.txt", "a") as logFile:
        try:
            log("main", "Started.")

            parseArgs()

            log("main", "Finished.")

        except Exception:
            log("main", format_exc() + "\ndatabase failed!\n", True)
            sys.stdout.write("ERROR")
        else:
            sys.stdout.write("OK")
