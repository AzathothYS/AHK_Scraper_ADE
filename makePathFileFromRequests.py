import sys
from traceback import format_exc
from datetime import datetime

WORKING_DIR = "C:/Users/7/Documents/Travail/Univ/App Univ/AHK_Scraper_ADE/"
REQUEST_FILE = "requests.txt"

SLASH_ESCAPE = "$%$"
REQUEST_SEPARATOR = "~~~"

SCRAPER_COMMANDS = [
    "RESTART",      # ferme tous les dossiers ouverts dans ADE, pour s'assurer que ça ne lag pas, le scraper reprend ensuit
    "RELOAD",       # recherge ADE, pour rafraichir le token par example et minimiser le lag        TODO : REMOVE ?
    "GET_EDT",      # exporte le ficher sur lequel le pointeur se trouve
    "UP"            # remonte d'un cran dans l'arborescence
]

def makePathFromRequests(requests, path_out="path.txt", arborescence="arboADE_corrected.txt"):
    """
    Transforme 'requests' en un fihcier Path lisible par le scraper AHK
    :param requests: str composé de chemins vers l'EdT demendé, séparés par des '~~~',
        ex: 'Beaulieu/Etudiants/SPM/L2-S4/GrPhysique/Gr2~~~Beaulieu/Etudiants/SPM/L2-S4/GrPhysique/Gr1'
    """
    requests = requests.split(REQUEST_SEPARATOR)

    requestsList = []
    for i, request in enumerate(requests):
        # on supprimme le / du début si il y en a un
        if request.startswith('/'):
            request = request[1:]
        # on ajoute un '__' devant le nom du fichier cible, utilisé pour différencier les dossiers des fichiers dans l'arborescence
        try:
            lastFile = request.rindex('/') + 1
        except ValueError:
            log(format_exc() + "\n\tUnable to parse this request:\n\t"
                + request
                + "\n\tIgnoring...", "ERROR")
            continue

        request = request[:lastFile] + "__" + request[lastFile:]

        request_ = request.split('/')
        if request.endswith('/'):
            request_.append('') # pour une raison incertaine, ce path target un fichier sans nom

        # les slashs on été remplacés pour éviter les problèmes
        for i, folder in enumerate(request_):
            if SLASH_ESCAPE in folder:
                request_[i] = folder.replace(SLASH_ESCAPE, '/')

        if request_ in requestsList:
            # ERREUR : il ne devrait pas y avoir de requêtes en double, mais on ignore
            log("duplicate request found: \n\t"
                + requests[i]
                + "\n\tIgnoring the duplicate...", "ERROR")
        else:
            requestsList.append(request_)

    if len(requestsList) == 0:
        log("Unable to parse requests. All were invalid.", "ERROR")
        return

    if len(requests) != len(requestsList):
        # il y a eu des doublons, on corrige 'requests' pour le log
        requests = list(set(requests))


    # stockage des requests formattées, utilisées plus tard pour updater la database
    with open(REQUEST_FILE, "w") as requestsFile:
        requestsFile.writelines(req + '\n' for req in requests)


    error = False
    paths = [] # Les paths de chaque requête
    with open(WORKING_DIR + arborescence, 'r', encoding='UTF-8') as arbo:
        for request in requestsList:
            arbo.seek(3) # reset du curseur, quatrième position du fichier, car la 1ère est occupée par les bytes de l'encodage du fichier

            path = []
            tabLen = 0
            for folder in request:
                # on parcours l'arborescence jusqu'à trouver le nom du dossier/fichier, en notant l'offset de la ligne
                # par rapport à celle du dossier parent
                n = 1
                line = getEdTName(arbo.readline(), tabLen)
                while line is None or line != folder:
                    if line is not None:
                        n += 1 # on ne compte que les dossiers/fichiers du dossier parent, donc avec le bon nmobre de tabulation
                    line = getEdTName(arbo.readline(), tabLen)

                    if (line == False):
                        # on a atteint la fin de l'arborescence, il y a une erreur
                        log("reached EOF when parsing request: \n\t"
                            + requests[requestsList.index(request)]
                            + "\n\tat folder : " + folder
                            + "\n\tIgnoring this request...", "ERROR")
                        error = True
                        break
                if error:
                    break

                path.append((n, folder))

                tabLen += 1

            if error:
                error = False
                continue

            paths.append(path)

    paths = optimizePaths(paths)

    paths = transformToPathList(paths)

    pathOutput = []
    flattenPath(paths, pathOutput)

    # on supprime les demandes de remonter d'un cran dans l'arborescence à la fin du path car ils ne servent à rien
    while pathOutput[-1] == SCRAPER_COMMANDS[3]:
        del pathOutput[-1]

    addOptimizationOrders(pathOutput)

    pathOutput[0] = str(int(pathOutput[0]) - 1) # le 1er dossier est la ligne initiale, il ne faut pas la compter

    with open(WORKING_DIR + path_out, 'w', encoding="UTF-8", newline='') as out: # pas de transformation des caractères de fin de ligne
        for order in pathOutput:
            out.write(order + '\n') # seulement '\n' car c'est comme ça que fonctionne le scraper

    log("Done. Length of path: {}".format(len(pathOutput)))



def getEdTName(line, tabOffset):
    if not line:
        return False # on a atteint la fin du fichier

    tabCount = line.count("    ")
    if (tabCount != tabOffset):
        return None

    return line[tabCount * 4:-1] # on exclut les tabulations et le retour à la ligne '\n'


def optimizePaths(paths):
    """
    Transforme une liste de paths en des dictionnaires imbriqués avec comme clés : (n, nom du dossier)
    et contenant soit un autre dictionnaire de même structure avec les contenus du dossier
    Les fichiers contiennent 'GET_EDT' à la place d'un autre dictionnaire
    """
    path_out = {}
    for i, path in enumerate(paths):
        n = 0
        folder = path_out
        while path[n] in folder:
            folder = folder[path[n]]
            n += 1

        if n < len(path) - 1:
            # le dossier où l'on se trouve n'est pas le dernier dossier de ce path
            folder.update(pathListToPathDict(path[n:]))
        else:
            # le dossier trouvé est le dossier cible mais pas le fichier cible du path (il n'y a pas de path identiques)
            folder[path[-1]] = SCRAPER_COMMANDS[2]

    return path_out

def pathListToPathDict(pathList):
    return {(pathList[0]): pathListToPathDict(pathList[1:]) if len(pathList) > 2 else {pathList[1]:SCRAPER_COMMANDS[2]}}


def transformToPathList(pathDict):
    pathList = []
    for (incr, folder_name), folder in pathDict.items():
        if type(folder) is dict:
            pathList.append((incr, folder_name, transformToPathList(folder)))
        else:
            pathList.append((incr, folder_name, folder))

    # triage puis on change les incréments pour être en fonction du terme précédant
    pathList.sort(key=lambda item:item[0])
    prev_incr = 0
    for i, (incr, folder_name, folder) in enumerate(pathList):
        pathList[i] = (incr - prev_incr, folder_name, folder)
        prev_incr = incr

    return pathList


def flattenPath(pathList, pathOutput):
    for incr, folder_name, folder in pathList:
        pathOutput.append(str(incr))
        if type(folder) is str:
            pathOutput.append(folder)  # si ce n'est pas un autre dossier, c'est un ordre 'GET_EDT', on le met avant le fichier cible
            pathOutput.append(folder_name)
        else:
            pathOutput.append(folder_name)
            flattenPath(folder, pathOutput)
            pathOutput.append(SCRAPER_COMMANDS[3])  # on remonte vers le dossier parent, ceci ne fait pas avancer d'une ligne


def addOptimizationOrders(path: list):
    if len(path) > 200:
        # si le path est relativement grand, on rajoute des endroits où le scraper ferme tous les dossiers ouverts dans
        # ADE, pour permettre d'éviter le lag
        # on en rajoute un toutes les centaines, après un 'GET_EDT' pour éviter les actions inutiles
        for i in range(100, len(path), 100):
            try:
                j = path[i:].index(SCRAPER_COMMANDS[2]) # TOTRY
            except ValueError:
                break
            path.insert(j+1, SCRAPER_COMMANDS[0])

        log("Path is HUGE. Added breaks.")



def log(text, tag="INFO"):
    with open(WORKING_DIR + "log.txt", "a") as log:
        log.write("\n{}\t- makePathFileFromRequests:\t{}:\t{}".format(datetime.now(), tag, text))



def test():
    requestsL = [
        "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Gr Physique/Gr.p1 CMI (6)",
        "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Compléments/Cplt PCS (Gr1)",
        "/ Etudiants/Beaulieu/SPM/L2 - PCGS - S4/Compléments/Cplt Méca2 (Gr2)",
        "/Salles/Beaulieu/Apparitrices/1er CYCLE$%$Zone nord/BAT 27/B27-Salle d'examens"
    ]

    requests = requestsL[0]
    for req in requestsL[1:]:
        requests += REQUEST_SEPARATOR + req

    print(requests)
    makePathFromRequests(requests)



def main():
    try:
        with open(REQUEST_FILE, "r", buffering=1, encoding="UTF-8") as reqFile:
            strFile = reqFile.read()

        strFile = strFile.replace('\r', '').replace('\n', REQUEST_SEPARATOR)

        # on supprime l'éventuel espace en fin de ligne
        if strFile.endswith(REQUEST_SEPARATOR):
            strFile = strFile[:-len(REQUEST_SEPARATOR)]

        log(strFile)

        makePathFromRequests(strFile)

    except Exception:
        log(format_exc() + ("\n\tWith params: " + str(sys.argv[1:])) if len(sys.argv) > 1 else "", "ERROR")
        sys.stdout.write("ERROR")

    else:
        log("Path made with params:\n\t" + strFile if len(sys.argv) > 1 else "None")
        sys.stdout.write("OK")



if __name__ == '__main__':
    main()
