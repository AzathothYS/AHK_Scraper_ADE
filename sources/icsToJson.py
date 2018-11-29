import json
import hashlib
import datetime
from pathlib import Path
from traceback import format_exc
import os
import sys

from sources.Utils import Logger, load_config

logger = Logger("icsToJson", "log.txt")
log = logger.log

config = load_config()

WORKING_DIR = config["Main"].getPath("WORKING_DIR")
EXPORTS_FOLDER = config["Requests"].getPath("EDT_OUT_DIR")
FILE_REQUESTS = config["Requests"].getPath("FILE_REQUESTS")

# list of the event, used by every function
events_list = []

# if the current processed file is empty or not
is_file_empty = False  # TODO : prendre en compte le nouveau type de fichiers vides (voir ics dans edt_out)


def ics_time_to_tuple(ics_time_start, ics_time_end):
    # ics format : YYYYMMDDTHHMMSSZ, but in GMT (add 1 to hours)
    # to (date, (Start hour, Start min, End hour, End min))
    return ics_time_start[:8], \
           (int(ics_time_start[9:11]) + 1,
            int(ics_time_start[11:13]),
            int(ics_time_end[9:11]) + 1,
            int(ics_time_end[11:13]))


LABELS = {
    "DTSTART": "debut",
    "DTEND": "fin",
    "SUMMARY": "titre",
    "LOCATION": "salle",
    "DESCRIPTION": "desc"
}

important_detect = ["TP", "CC"]


def event_to_dict(event):
    # from ics events to dict with all the necessary information
    event_add = {}
    for param in event.splitlines():
        try:
            name, value = param.split(":", 1)
            if name in LABELS:
                event_add[LABELS.get(name)] = value
        except ValueError as e:
            log(format_exc() + "  -> " + param + "\nFAILED", True)
            raise e

    if len(event_add) != 5:
        log("Pas assez de params pour l'event : {}".format(event_add), True)
        raise ImportError("ERROR : Pas assez de params pour l'event : " + str(event_add))

    # format changes
    event_add["jour"], event_add["hour"] = ics_time_to_tuple(event_add.pop("debut"), event_add.pop("fin"))

    if event_add["desc"].endswith(')') and event_add["desc"][-30] == '(':
        # deleting the export thing + last '\n' + first '\n'
        event_add["desc"] = event_add["desc"][2:-32]

    # if it is an important event
    event_add["siImportant"] = False
    for word in important_detect:
        if event_add["titre"].find(word) >= 0:
            event_add["siImportant"] = True
            break

    return event_add


def add_info():
    # add info about the weeks, days and a checksum for each week and day
    # changes events_list structure

    if is_file_empty:
        event_hash = hashlib.md5()
        event_hash.update(events_list[0]["empty"].encode())
        events_list[0]["_sum"] = event_hash.hexdigest()
        return

    # checksum for each event
    for event in events_list:
        # fixed order, else the hash would be different every time, forcing it to update every time
        event_hash = hashlib.md5()
        event_hash.update(event["titre"].encode())
        event_hash.update(event["jour"].encode())
        event_hash.update(str(event["hour"]).encode())
        event_hash.update(event["salle"].encode())
        event_hash.update(event["desc"].encode())
        event["_sum"] = event_hash.hexdigest()

    new_events_list = [{"day": events_list[0]["jour"], "hours": 0, "important": 0, "events": []}]

    for event in events_list:
        # find the corresponding day and add the event, else add a new day
        day = -1
        for index, v in enumerate(new_events_list):
            if v["day"] == event["jour"]:
                day = index

        if day == -1:
            new_events_list.append({"day": event["jour"], "hours": 0, "important": 0, "events": []})

        new_events_list[day]["events"].append(event)

    events_list.clear()
    events_list.append(new_events_list[0])
    if len(new_events_list) > 1:
        # sorting the output list by day
        for v in new_events_list[1:]:
            i = 0
            while True:
                if i >= len(events_list):
                    events_list.append(v)
                    break
                elif events_list[i]["day"] < v["day"]:
                    i += 1
                else:
                    events_list.insert(i, v)
                    break

    # counting hours and checking if there is any important events (TP and CC)
    # + checksum for each day
    for day in events_list:
        # number of important things
        day["important"] = len([True for event in day["events"] if event["siImportant"]])

        # summing the length of every event of the day
        hours = [event["hour"] for event in day["events"]]
        day["hours"] = 0
        for s_hour, s_min, e_hour, e_min in hours:
            day["hours"] += e_hour - s_hour + (e_min - s_min) / 60.0

        # checksum
        str_sum = str(day["day"]) + str(day["important"]) + str(day["hours"])

        for event in day["events"]:
            str_sum += event["_sum"]

        day["_sum"] = hashlib.md5(str_sum.encode()).hexdigest()


def add_weeks():
    # add week info and put days into weeks

    if is_file_empty:
        return

    week_list = [{"week_nb": 0, "important": 0, "hours": 0, "days": [], "_sum": ""}]
    date = events_list[0]["day"]
    week_list[0]["week_nb"] = datetime.date(int(date[:4]), int(date[4:6]), int(date[6:])).strftime("%W")

    for day in events_list:
        date = day["day"]
        week_number = datetime.date(int(date[:4]), int(date[4:6]), int(date[6:])).strftime("%W")

        # find the corresponding week
        i = None
        for i, week in enumerate(week_list):
            if week["week_nb"] == week_number:
                break
            elif i == len(week_list) - 1:
                # create a new week
                week_list.append({"week_nb": week_number, "important": 0, "hours": 0, "days": [], "_sum": ""})
                i = -1

        week_list[i]["important"] += day["important"]
        week_list[i]["hours"] += day["hours"]
        week_list[i]["_sum"] += day["_sum"]
        week_list[i]["days"].append(day)

    for week in week_list:
        # datetime format : YYYY-WweekNumber-dayNumberInWeek
        date = str(week["days"][0]["day"])[:4] + "-W" + str(week["week_nb"]) + "-1"
        date = datetime.datetime.strptime(date, "%Y-W%W-%w")

        week["start"] = str(date.date())
        week["end"] = str((date + datetime.timedelta(days=6)).date())

        # adding a list of the empty days
        week["empty_days"] = [0, 1, 2, 3, 4, 5, 6]
        for index, day in enumerate(week["days"]):
            # converting stored format to datetime format
            date = day["day"][:4] + "-" + day["day"][4:6] + "-" + day["day"][6:]
            date = datetime.datetime.strptime(date, "%Y-%m-%d")
            week["empty_days"].remove(date.weekday())

    # adding checksums
    for week in week_list:
        week["_sum"] += str(week["week_nb"])
        week["_sum"] = hashlib.md5(week["_sum"].encode()).hexdigest()

    events_list.clear()
    for w in week_list:
        events_list.append(w)


def add_file_info(true_name, address):
    # adds checksum for the entire file + name of the file that have been extracted from ADE

    events_list.insert(0, {"file_sum": "", "source_file": true_name, "address": address})

    file_hash = hashlib.md5()

    for week in events_list[1:]:
        file_hash.update(week["_sum"].encode())

    events_list[0]["file_sum"] = file_hash.hexdigest()


# main
def ics_to_json(ics_file, json_file, true_name, address):
    global is_file_empty

    with open(EXPORTS_FOLDER / ics_file, "r") as calcADE:
        # splits the calc into events, which are recognized by their 'BEGIN' label
        # also replaces end of lines followed by a space, which are simple returns in ics
        log("Processing " + ics_file)

        raw_events = calcADE.read().replace("\n ", "").split("BEGIN")

        # on ignore le descripteur du fichier en utilisant '__contains__'
        if len(raw_events) == 2 and "END:VCALENDAR" in raw_events[1]:
            log(ics_file + " is empty!")
            is_file_empty = True
            events_list.append({"empty": "true"})
        else:
            # the first one is the file descriptor, the second one is data about the file, we don't need those
            raw_events.pop(0)
            raw_events.pop(0)

            for event in raw_events:
                events_list.append(event_to_dict(event))

    add_info()
    add_weeks()
    add_file_info(true_name, address)

    log("Done. Writing output file to " + str(EXPORTS_FOLDER.absolute()) + "/" + json_file)

    with open(EXPORTS_FOLDER / json_file, "w") as calWrite:
        # calWrite.writelines(json.dumps(events_list, ensure_ascii=False, indent="	").replace('\\\\', '\\'))

        edt_json = json.dumps(events_list, ensure_ascii=False).replace('\\\\', '\\').replace(r'\,', ',')

        # on vérifie le Json généré
        protec = 0
        while True:
            try:
                json.loads(edt_json)
                log("icsToJson", "Json is valid for " + json_file)
                break
            except json.JSONDecodeError as e:
                # le json est invalide
                err_pos = e.pos

                print(err_pos)
                if edt_json[err_pos:err_pos+1] == '\,':
                    # on escape une virgule à l'intérieur d'un str, ce qui n'est pas valide
                    edt_json = edt_json[:err_pos] + edt_json[err_pos + 1]
                else:
                    raise Exception("Unknown json formatting problem")

                protec += 1
                if protec > 100:
                    msg = "Failed to generate correct Json for '" + ics_file + "' aka '" + true_name + "'"
                    log(msg, True)
                    raise Exception(msg)

        calWrite.writelines(edt_json)

    # reset des variables
    events_list.clear()
    is_file_empty = False


def new_main():
    log("Started.")

    requests = {}
    with FILE_REQUESTS.open("r", encoding="UTF-8") as requests_file:
        for line in requests_file:
            file_cid, _, file_address = line.strip().split(' ', maxsplit=2)
            requests[file_cid] = file_address

    # on trie les tous les fichiers ics du dossier des exports en fonction du numéro au début de leur nom
    ics_files = sorted(EXPORTS_FOLDER.glob("*.ics"), key=lambda item: int(item.stem))

    # on parcourt, dans l'ordre croissant, les fichiers ics du dossier
    for i, file in enumerate(ics_files):  # type:int, os.DirEntry
        if not file.is_file():
            continue

        name, _, ext = file.name.partition('.')

        if ext != "ics":
            continue

        address = requests[name]
        true_name = address[address.rfind('|') + 1:]

        ics_to_json(file.name, name + ".json", true_name, address)


if __name__ == '__main__':
    if Path(os.getcwd()) != WORKING_DIR:
        os.chdir(WORKING_DIR)

    try:
        # main()
        new_main()
    except Exception:
        log(format_exc(), True)
        log("Conversion failed.\n", True)
        sys.stdout.write("ERROR")
    else:
        log("Finished.\n")
        sys.stdout.write("OK")
    finally:
        logger.close()
