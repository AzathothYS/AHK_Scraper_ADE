import os
import sys
from traceback import format_exc
from datetime import datetime
from pathlib import Path

WORKING_DIR = Path("C:/Users/7/Documents/Travail/Univ/App Univ/AHK_Scraper_ADE/")

TEMP_FILE = Path("temp")

IS_IN_TERMINAL = sys.stdout.isatty()


def patchArborescence(patchFilePath:str, arboFilePath:str, pathFilePath:str):
    with open(arboFilePath, mode="r+", buffering=1, encoding="UTF-8") as arboFile:
        path = init(arboFile, pathFilePath)

        line, indent = followPath(path, arboFile)

        with open(TEMP_FILE, mode="a", encoding="UTF-8") as temp:
            # on a atteint la position voulue du patch, et 'line' contient la ligne précédant le patch

            temp.write(line)

            with open(patchFilePath, mode="r", encoding="UTF-8") as patchFile:
                patchFile.seek(3) # on passe les bytes d'identification du fichier
                temp.write(patchFile.read())

            # on rajoute tout le reste de l'arborescence
            line = arboFile.readline()
            while line:
                temp.write(line)
                line = arboFile.readline()


    log("Applied patch. Moving temp file to '{}'".format(arboFilePath))

    TEMP_FILE.replace(arboFilePath)  # remplacement du fichier arborescence par le fichier temporaire

    log("Patch successful.")



def patchFolderOfArborescence(patchFilePath:str, arboFilePath:str, pathFilePath:str):
    with open(arboFilePath, mode="r+", buffering=1, encoding="UTF-8") as arboFile:
        path = init(arboFile, pathFilePath)

        _, indent = followPath(path, arboFile)

        with open(TEMP_FILE, mode="a", encoding="UTF-8") as temp:

            # on a atteint la position voulue du patch

            with open(patchFilePath, mode="r", encoding="UTF-8") as patchFile:
                patchFile.seek(3) # on passe les bytes d'identification du fichier
                temp.write(patchFile.read())

            # on avance dans l'arborescence jusqu'a sortir du dossier que l'on vient de patch
            line = arboFile.readline()
            while getIndent(line) > indent and line:
                line = arboFile.readline()

            if not line:
                # on a atteint la fin de l'arborescence, si le patch se trouvait à la fin, c'est normal, sinon non.
                log("Reached EOF while parsing '{}', patch applied but maybe incorrect.".format(arboFilePath), error=True)

            # on rajoute tout le reste de l'arborescence
            while line:
                temp.write(line)
                line = arboFile.readline()


    log("Applied patch. Moving temp file to '{}'".format(arboFilePath))

    TEMP_FILE.replace(arboFilePath) # remplacement du fichier arborescence par le fichier temporaire

    log("Patch successful.")



def init(arboFile, pathFilePath):
    with open(pathFilePath, mode="r", encoding="UTF-8") as pathFile:
        path = [line[:-1] for line in pathFile.readlines()]  # on enlève la fin de chaque line ('\n')

    if not path[0].isnumeric():
        # le path est à l'envers, à cause du scraper
        path.reverse()

    # on passe les bytes d'identification du fichier
    arboFile.seek(3)

    with open(TEMP_FILE, mode="wb") as temp:
        temp.write(b"\xEF\xBB\xBF")  # marque UTF-8 de début de fichier, obligatoire pour que le fichier soit utilisable par les autres scripts

    return path

def followPath(path, arboFile):
    with open(TEMP_FILE, mode="a", encoding="UTF-8") as temp:
        # on suit le path dans l'arborescence jusqu'à pour arriver à la position du patch, tout en écrivant
        # toutes les lignes de l'arborescence parcourues dans le fichier temporaire

        indent = 0

        pathIter = path.__iter__()
        increment = str(int(pathIter.__next__()) + 1)  # le 1er incrément se fait depuis le 1er dossier, mais pas dans notre cas
        folderName: str = pathIter.__next__()
        while True:
            if not increment.isnumeric():
                raise ValueError("'{}' should be a number!".format(increment))
            increment = int(increment)

            while increment > 0:
                line = arboFile.readline()

                if (getIndent(line) == indent):
                    increment -= 1
                    if increment == 0:
                        break

                elif (getIndent(line) < indent):
                    log("Target '{}' is not in the parent folder! (increment is bigger than the number of items inside parent)".format(folderName))
                    raise Exception("Increment is bigger than the number of items inside parent")

                temp.write(line)

            try:
                increment = pathIter.__next__()
            except StopIteration:
                return line, indent # nous sommmes à la fin du path

            # 'line' est la cible de cette étape du path

            if stripIndent(line[:-1]) != folderName:
                # le path et l'arborescence ne sont pas d'accord
                log("Could not get to the end of the path: '{}' is not '{}'".format(stripIndent(line), folderName), error=True)
                raise Exception("Invalid path.")

            temp.write(line)

            indent += 1  # nous sommes montés d'un cran dans l'arborescence

            folderName = pathIter.__next__()

def getIndent(line:str) -> int:
    return line.count("    ")

def stripIndent(line:str) -> str:
    return line[getIndent(line) * 4:]


# ---------------------------------------------------------------


def parseArgs():
    if len(sys.argv) == 1:
        print("Help:\n" +
              "-patch PATCH_FILE ARBORESCENCE_FILE PATH_FILE\tpatches 'ARBORESCENCE_FILE' with 'PATCH_FILE'\n" +
              "\t\tusing 'PATH_FILE' to find the position of the patch in the arborescence. All files can be relative paths.\n" +
              "-patchFolder PATCH_FILE ARBORESCENCE_FILE PATH_FILE\tpatches 'ARBORESCENCE_FILE' with 'PATCH_FILE'\n" +
              "\t\tusing 'PATH_FILE' to find the position of the patch folder to patch (overriding the existing folder)\n" +
              "\t\tin the arborescence. All files can be relative paths.\n")
        return

    argParser = sys.argv[1:].__iter__()
    for arg in argParser:
        if arg == "-patch":
            try:
                patchFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patch'! expected 'patchFile' after.")

            try:
                arboFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patch'! expected 'arboFile' after.")

            try:
                pathFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patch'! expected 'pathFile' after.")

            log("Patching '{}' with '{}' following '{}'...".format(arboFile, patchFile, pathFile))
            patchArborescence(patchFile, arboFile, pathFile)

        elif arg == "-patchFolder":
            try:
                patchFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patchFolder'! expected 'patchFile' after.")

            try:
                arboFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patchFolder'! expected 'arboFile' after.")

            try:
                pathFile = argParser.__next__()
            except StopIteration:
                raise Exception("Not enough parameters for '-patchFolder'! expected 'pathFile' after.")

            log("Patching '{}' with '{}' at the folder of '{}'...".format(arboFile, patchFile, pathFile))
            patchFolderOfArborescence(patchFile, arboFile, pathFile)

        else:
            raise ValueError("Unknown parameter: '{}'".format(arg))



def getTime() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def log(text: str, error = False):
    tag = sys._getframe(1).f_code.co_name
    if tag == "<module>":
        tag = "root"

    if error:
        logFile.write("\n{}\t- arborescenceUpdate:\t{}:\tERROR - {}".format(getTime(), tag, text))
    else:
        logFile.write("\n{}\t- arborescenceUpdate:\t{}:\tINFO  - {}".format(getTime(), tag, text))

    if IS_IN_TERMINAL:
        print("{} \t {} - {}".format(tag, "ERROR" if error else "INFO", text))


if __name__ == '__main__':
    if Path(os.getcwd()) != WORKING_DIR:
        os.chdir(WORKING_DIR)

    with open("log.txt", mode="a", encoding="UTF-8") as logFile:
        try:
            log("Started.")

            parseArgs()
            #patchArborescence("arboUpdate.txt", "arboADE_corrected.txt", "pathUpdate.txt")

            log("Finished.")

        except Exception as e:
            log(format_exc() + "\narborescenceUpdate Failed!\n", error=True)
            sys.stdout.write("ERROR")
        else:
            sys.stdout.write("OK")