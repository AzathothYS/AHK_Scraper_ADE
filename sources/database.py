# coding=UTF-8

import os
import sys
from traceback import format_exc
import json
from pathlib import Path
from typing import Tuple, List, Dict, Iterator
from types import FunctionType

from sources.Utils import Logger, load_config

log: FunctionType

config = load_config()

WORKING_DIR = config["Main"].getPath("WORKING_DIR")
REQUESTS_FILE = config["Requests"].getPath("REQUESTS")
EDT_OUT_DIR = config["Requests"].getPath("EDT_OUT_DIR")

URLS_FILE = config["Database"].getPath("URLS_LIST")
ARBORESCENCE_FILE = config["Database"].getPath("ARBORESCENCE")
SUMMARY_FILE = config["Database"].getPath("SUMMARY")
UPDATE_FILE = config["Database"].getPath("UPDATE_LOG")
EDT_LIST_DIR = config["Database"].getPath("EDT_LIST")
BACKUP_DIR = config["Database"].getPath("BACKUPS_DIR")  # TODO

summary: Dict[str, Dict[str, str]] = {}

updates = []

REMOVE_ICS_FILES = True


def update_database():
    # on met à jour la database avec les fichiers **.json dans EdTOut/

    # récupération de la liste des requêtes
    requests: List[Tuple[str, str]] = []
    with REQUESTS_FILE.open("r", encoding="UTF-8") as requests_file:
        for line in requests_file:
            file_cid, _, address = line.strip().split(' ', maxsplit=2)
            requests.append((file_cid, address))
    requests.sort(key=lambda item: item[0])  # triage en fonction de l'id du fichier

    log("Requests: " + str(requests))

    # liste de tous les fichiers à mettre à jour, dans l'ordre croissant de leur nom de fichier
    edt_req_list = sorted(EDT_OUT_DIR.glob("*.json"), key=lambda item: item.stem)

    log("Files: " + str(list(edt_req_list)))

    if len(edt_req_list) != len(requests):
        log("Different number of requests and EdT! {} != {}".format(len(requests), len(edt_req_list)), True)
        raise IndexError()

    for edt_req_file, (file_cid, address) in zip(edt_req_list, requests):
        edt_file = EDT_LIST_DIR / (file_cid + ".json")

        # log("updateDatabase", "Processing '" + request + "' and edt file: '" + str(edt_req_file) + "'")

        # ouverture du fichier à déplacer pour obtenir les infos stockées dans le premier élément de la liste json
        with edt_req_file.open("r", encoding="UTF-8") as edt:
            edt_info = json.load(edt)[0]  # type:dict

        if not edt_file.exists():
            # le fichier n'existe pas encore
            last_update = "0"
        else:
            # on récupère les infos précédantes pour ensuite les mettre à jour
            edt_info_prev = get_from_summary(file_cid)
            if not edt_info_prev:
                # clé non présente dans le summary
                last_update = "0"
            else:
                try:
                    if edt_info_prev["file_sum"] == edt_info["file_sum"]:
                        # les checksums sont égaux, pas d'update à faire
                        log("File '{}' is already up to date".format(edt_file))
                        # on supprimme le fichier dans 'edt_out'
                        os.remove(str(edt_req_file))
                        continue
                    last_update = edt_info_prev["last_update"]
                except KeyError as e:
                    log("Could not compare checksums for file '{}': edt_info_prev={} - edt_info={}"
                        .format(edt_req_file, "_sum" in edt_info_prev, "_sum" in edt_info), True)
                    raise e

        update_log(address, file_cid, last_update, edt_info["file_sum"])
        update_summary(address, file_cid, edt_info["file_sum"])

        edt_req_file.replace(edt_file)  # déplacement du fichier vers la database

    log("Done.")


def clean_database():
    global summary
    cleaned_summary = []
    for file_cid, entry in summary.items():
        # TODO : filtrer les fichiers pas utilisés depuis longtemps (voir pour extraire la date de mise à jour des ics)
        cleaned_summary.append((file_cid, entry))
    cleaned_summary.sort(key=lambda item: item[0])
    summary = dict(cleaned_summary)

    log("Cleaned the summary.")


def verify_database():
    # on parcourt l'arbo et le summary en même temps que la database pour voir si tout correspond ou pas

    # TODO : vérifier l'arbo avec les fct de verify arbo

    # comparaison entre l'arborescence d'ADE stockée et le sommaire de la database
    arbo_cids: List[str] = []
    arbo_names: List[str] = []
    root = '0'
    with ARBORESCENCE_FILE.open(mode="r", buffering=1000, encoding="UTF-8") as arbo_file:
        for line in arbo_file:
            file_id, _, name = line.strip().partition('\t')
            if file_id.startswith('-'):
                root = file_id[1:]
                if root == "100":
                    root = '0'  # root of the roots
            arbo_cids.append(root + '_' + file_id + '_' + str(name.count('\t')))
            arbo_names.append(name.replace('\t', ''))

    arbo_errors = 0
    for file_cid, entry in summary.items():
        try:
            i = arbo_cids.index(file_cid)
        except ValueError:
            log("Impossible de trouver '{} ({})' dans l'arborescence!".format(file_cid, entry), True)
            arbo_errors += 1
        else:
            # build address
            address = entry["address"].split('|')
            level = file_cid[-1]
            if int(level) >= len(address):
                log("Le fichier '{} ({})' n'a pas une profondeur correcte {} au lieu de {}"
                    .format(file_cid, entry, level, len(address)))
                arbo_errors += 1
                continue
            while level != '0':  # on vérifie l'addresse du fichier dans l'arborescence jusqu'à la root
                if arbo_names[i] != address[int(level)]:
                    log("L'addresse du fichier '{} ({})' ne correspond pas à celle dans l'arborescence: l={}, n='{}'"
                        .format(file_cid, entry, i, arbo_names[i]), True)
                    arbo_errors += 1
                    i = -1
                    break
                level = str(int(level) - 1)
                while not arbo_cids[i].endswith(level):  # on recule jusqu'au prochain dossier
                    i -= 1
                    if i < 0:
                        log("Impossible de trouver le prochain fichier à {} pour '{} ({})'"
                            .format(level, file_cid, entry), True)
                        arbo_errors += 1
                        break
                if i < 0:
                    break
            if i < 0:
                break
            if not arbo_cids[i][3] == file_cid[0]:
                log("Root index doesn't match found root {} at {} for '{} ({})'"
                    .format(arbo_cids[i][3], i, file_cid, entry), True)
                arbo_errors += 1

    # comparaison entre le sommaire de la database et la database
    database_errors = 0
    gen_summary = summary.items().__iter__()
    gen_database = iterate_through_database()
    for (file_cid, entry_summary), (file_name, entry_database) in zip(gen_summary, gen_database):
        if file_cid != file_name:
            log("'{}' est différent de '{}', les cids ne sont pas les mêmes!".format(file_cid, file_name), True)
            database_errors += 1
        if entry_database["file_sum"] != entry_summary["file_sum"]:
            log("Le checksum de la database et du summary sont différents pour '{}' ('{}')"
                .format(entry_summary["true_name"], entry_database["source_file"]), True)
            database_errors += 1

    try:
        if gen_summary.__next__() is not None or gen_database.__next__() is not None:
            log("La taille de la database et du summary ne correspondent pas!")
            database_errors += 1
    except StopIteration:
        pass

    # TODO : envoyer un message à l'ADMIN pour chaque erreur
    if arbo_errors == 0 and database_errors > 0:
        log("La database est corrompue!", True)
        raise Exception("La database est corrompue. {} erreurs trouvées.".format(database_errors))
    elif arbo_errors > 0 and database_errors == 0:
        log("L'arborescence est corrompue!", True)
        raise Exception("L'arborescence est corrompue! {} erreurs trouvées.".format(arbo_errors))
    elif arbo_errors > 0 and database_errors > 0:
        log("Le summary est corrompu!", True)
        raise Exception("Le summary est corrompu! {} erreurs trouvées dans l'arborescence et {} erreurs trouvées "
                        "dans la database.".format(arbo_errors, database_errors))
    else:
        log("Aucune erreur trouvée.")


def remove_ics_files():
    ics_list = EDT_OUT_DIR.glob("*.ics")
    for ics_path in ics_list:
        os.remove(str(ics_path))
    log("Removed ics files.")


def get_updates():
    # TODO : à refaire mais en mieux
    # actuellement ne fait qu'une simple liste des fichiers déjà présents dans la database

    to_update = []
    for file_cid, entry in summary.items():
        to_update.append(file_cid + ' ' + entry["address"])

    log("Got {} files to update.".format(len(to_update)))

    with REQUESTS_FILE.open(mode="a", encoding="UTF-8") as requests:
        requests.writelines(to_update)

    log("Outputted to " + REQUESTS_FILE.name)


def make_rand_requests(nb: int):
    from random import randint

    with REQUESTS_FILE.open(mode="w", encoding="UTF-8") as requests_file, \
            ARBORESCENCE_FILE.open(mode="r", encoding="UTF-8", buffering=1000) as arbo_file:
        while nb > 0:
            nb -= 1

            arbo_file.seek(3)  # skip file descriptor
            arbo_file.readline()  # skip root file

            root = ""
            deepness = 0
            req_str = ""
            indent = 0
            pos = arbo_file.tell()
            while True:
                nb_of_lines_in_folder = 0

                for line in arbo_file:  # parse current folder, count files in it
                    current_indent = get_indent_of_line(line)
                    if current_indent == indent:
                        nb_of_lines_in_folder += 1
                    elif current_indent < indent:
                        break  # on est sortis du dossier

                # choose a random file in the folder
                if nb_of_lines_in_folder - 1 <= 0:
                    choice = 0
                else:
                    choice = randint(0, nb_of_lines_in_folder - 1)

                arbo_file.seek(pos if pos >= 3 else 3)  # go back to the start of the folder

                line = " "
                while line:  # on change de structure pour pouvoir utiliser 'tell'
                    line = arbo_file.readline()
                    current_indent = get_indent_of_line(line)
                    if current_indent == indent:
                        choice -= 1
                        if choice < 0:  # target line
                            pos = arbo_file.tell()

                            if not line.__contains__("__"):  # comme c'est un dossier on vérifie qu'il n'est pas vide
                                next_line = arbo_file.readline()
                                if get_indent_of_line(next_line) <= indent:
                                    # le dossier sélectionné est vide
                                    log("Trouvé un dossier vide. On recommence...", error=True)
                                    line = ''

                            indent += 1
                            break

                    elif current_indent < indent:  # nous sommes sortis du dossier
                        log("Impossible de trouver la cible dans le dossier.", error=True)
                        line = ''
                        break

                if not line:
                    if choice < 0:
                        nb += 1  # pour compenser et bien obtenir à la fin le nombre voulu de requests
                        break
                    else:
                        raise EOFError("Reached EOF while parsing " + ARBORESCENCE_FILE.name
                                       + " - Folder : " + req_str
                                       + " - indent: " + str(indent)
                                       + " - nb_of_lines_in_folder: " + str(nb_of_lines_in_folder)
                                       + " - choice: " + str(choice))

                if line.startswith("__"):  # end of request building
                    req_str += root + '_' + line[:line.index('\t')] + '_' + str(deepness) + ' '
                    req_str += line[line.rindex('\t') + 1:-1]  # on ignore la fin de ligne en plus de l'indentation
                    requests_file.write(req_str + '\n')
                    log("New request: " + req_str)
                    break
                else:  # add the folder to the address
                    if len(req_str) == 0:
                        if not line.startswith('-'):
                            log("Root folder line isn't a root folder: {}".format(line))
                            break
                        root = line[1:2]  # get the root index
                    else:
                        deepness += 1
                        req_str += line[line.rindex('\t') + 1:-1]
                        req_str += '|'


# ------------------------------------------------
# Fonctions utilitaires pour manipuler la database
# ------------------------------------------------

# exemple d'un summary d'un fichier:
# "<file_cid>": {
#   address: " Etudiants|Beaulieu|SPM|L3- Physique|L3 P - S5|Groupe B|CMI"
#   file_sum: "36540554354643"
#   last_update: "2018-06-01 20:02"
# }


def iterate_through_database(start=EDT_LIST_DIR) -> Iterator:
    for obj in start.iterdir():
        if obj.suffix != ".json":  # ce n'est pas un fichier de l'arborescence
            continue

        with obj.open(mode="r", buffering=1, encoding="UTF-8") as file:
            yield obj.stem, json.load(file)[0]  # output file_cid et file info, toujours au début du fichier


def get_indent_of_line(line: str) -> int:
    return line.count("\t") - 1


def update_log(path: str, cid: str, prev_update: str, checksum: str):
    updates.append({
        "path": path,
        "prev_update": prev_update,
        "update": logger.get_time(),
        "file_cid": cid,
        "checksum": checksum
    })


def save_update_log():
    with UPDATE_FILE.open(mode="w", encoding="UTF-8") as updateFile:
        json.dump(updates, updateFile, ensure_ascii=False, indent="\t")
    log("Saved update log.")


def get_from_summary(cid: str) -> dict:
    try:
        return summary[cid]
    except KeyError:
        return {}


def update_summary(address: str, file_cid: str, checksum: str):
    summary[file_cid] = {
        "address": address,
        "file_sum": checksum,
        "last_update": logger.get_time()
    }
    log("Updated '" + address + "' of cid: " + file_cid)


def load_summary():
    global summary
    if SUMMARY_FILE.exists():
        with SUMMARY_FILE.open(mode="r", encoding="UTF-8") as summary_file:
            summary = json.load(summary_file)


def save_summary():
    with SUMMARY_FILE.open(mode="w", encoding="UTF-8") as summary_file:
        json.dump(summary, summary_file, indent="\t", ensure_ascii=False)
    log("Sucessfully saved new summary")


# ----------------------------------------


def parse_args():
    if len(sys.argv) == 1:
        # affichage de l'aide dans le terminal
        print("Outil d'édition de la database des Emplois du temps d'ADE :\n"
              "\t-update\t\t\tmet à jour la database avec les fichiers NN.json stockés dans 'EdTOut/',"
              "\n\t\t\t\t\tliste toutes les mises à jour dans '" + UPDATE_FILE.name + "'\n"
              "\t-clean\t\t\tnettoie la database des fichiers trop anciens ou pas utilisés\n"
              "\t-verify\t\t\tvérifie la correspondance entre les dossiers de la database et le dernier"
              "\n\t\t\t\t\tfichier de l'arborescence d'ADE stocké\n"
              "\t-getUpdates\t\técrit dans 'requests.txt' la liste des emplois du temps présents dans"
              "\n\t\t\t\t\tla database à metre à jour\n"
              "\t-makeRandomRequests n\técrit dans 'requests.txt' n requêtes aléatoires\n")
        return

    log("Started with params: " + str(sys.argv))

    args_it = sys.argv[1:].__iter__()
    for arg in args_it:
        if arg == "-debug":
            global REMOVE_ICS_FILES
            REMOVE_ICS_FILES = False

        elif arg == "-update":
            load_summary()

            update_database()

            save_update_log()
            save_summary()

            if REMOVE_ICS_FILES:
                remove_ics_files()

            clean_database()
            verify_database()

        elif arg == "-clean":
            load_summary()
            clean_database()
            save_summary()
            verify_database()

        elif arg == "-verify":
            load_summary()
            verify_database()

        elif arg == "-getUpdates":
            load_summary()
            get_updates()

        elif arg == "-makeRandomRequests":
            n = -1
            try:
                n = args_it.__next__()
                assert n.isdigit()
            except StopIteration:
                print("Not enough parameters! Expected a number.")
                raise Exception("Not enough parameters.")
            except AssertionError:
                print("'{}' is not a number!".format(n))
                raise Exception("'{}' is not a number!".format(n))
            else:
                make_rand_requests(int(n))
        else:
            log("Invalid parameter: '" + arg + "'", True)
            raise Exception("Invalid parameter.")


if __name__ == '__main__':
    if Path(os.getcwd()) != WORKING_DIR:
        os.chdir(WORKING_DIR)

    logger = Logger("database", "log.txt")
    log = logger.log

    try:
        log("Started.")
        parse_args()
        log("Finished.")
    except Exception:
        log(format_exc() + "\ndatabase failed!\n", True)
        sys.stdout.write("ERROR")
    else:
        sys.stdout.write("OK")
    finally:
        logger.close()
