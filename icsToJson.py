import json
import hashlib
import datetime
from traceback import format_exc
import os
import sys

PATH_FILE = "path.txt"
EXPORTS_FOLDER = "EdTOut"


# list of the event, used by every function
eventsList = []

def icsTimeToTuple(icsTimeStart, icsTimeEnd):
    # ics format : YYYYMMDDTHHMMmillisZ, but in GMT (add 2 to hour)
    # to (date, (Start hour, Start min, End hour, End min))
    return icsTimeStart[:8],\
           (int(icsTimeStart[9:11]) + 2, int(icsTimeStart[11:13]), int(icsTimeEnd[9:11]) + 2, int(icsTimeEnd[11:13]))

LABELS = {"DTSTART": "debut",
          "DTEND":"fin",
          "SUMMARY":"titre",
          "LOCATION":"salle",
          "DESCRIPTION":"desc"
          }

important_detect = ["TP", "CC"]

def eventToDict(event):
    # from ics events to dict with all the necessary information
    eventAdd = {}
    for param in event.splitlines():
        try:
            name, value = param.split(":", 1)

            if name in LABELS:
                eventAdd[LABELS.get(name)] = value

        except ValueError:
            log("eventToDict", format_exc() + "  -> "  +  param  + "\nIGNORED", True)
            pass

    if len(eventAdd) != 5:
        log("eventToDict", "Pas assez de params pour l'event : {}".format(eventAdd), True)
        raise ImportError("ERROR : Pas assez de params pour l'event : " + str(eventAdd))

    # format changes
    eventAdd["jour"], eventAdd["hour"] = icsTimeToTuple(eventAdd.pop("debut"), eventAdd.pop("fin"))

    if eventAdd["desc"].endswith(')') and eventAdd["desc"][-30] == '(':
        # deleting the export thing + last '\n' + first '\n'
        eventAdd["desc"] = eventAdd["desc"][2:-32]

    # if it is an important event
    eventAdd["siImportant"] = False
    for word in important_detect:
        if eventAdd["titre"].find(word) >= 0:
            eventAdd["siImportant"] = True
            break

    return eventAdd


def addInfo():
    # add info about the weeks, days and a checksum for each week and day
    # changes eventsList structure

    # checksum for each event
    for event in eventsList:
        # fixed order, else the hash would be different every time, forcing it to update every time
        hash = hashlib.md5()
        hash.update(event["titre"].encode())
        hash.update(event["jour"].encode())
        hash.update(str(event["hour"]).encode())
        hash.update(event["salle"].encode())
        hash.update(event["desc"].encode())
        event["_sum"] = hash.hexdigest()

    newEventsList = [{"day":eventsList[0]["jour"], "hours":0, "important":0, "events":[]}]

    for event in eventsList:
        # find the corresponding day and add the event, else add a new day
        day = -1
        for index, v in enumerate(newEventsList):
            if v["day"] == event["jour"]:
                day = index

        if day == -1:
            newEventsList.append({"day": event["jour"], "hours": 0, "important": 0, "events": []})

        newEventsList[day]["events"].append(event)
        #newEventsList[day]["hours"] +=

    eventsList.clear()
    eventsList.append(newEventsList[0])
    if len(newEventsList) > 1:
        # sorting the output list by day
        for v in newEventsList[1:]:
            i = 0
            while True:
                if i >= len(eventsList):
                    eventsList.append(v)
                    break
                elif eventsList[i]["day"] < v["day"]:
                    i += 1
                else:
                    eventsList.insert(i, v)
                    break

    # counting hours and checking if there is any important events (TP and CC)
    # + checksum for each day
    for day in eventsList:

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


def addWeeks():
    # add week info and put days into weeks

    weekList = [{"week_nb":0, "important":0, "hours":0, "days":[], "_sum":""}]
    date = eventsList[0]["day"]
    weekList[0]["week_nb"] = datetime.date(int(date[:4]), int(date[4:6]), int(date[6:])).strftime("%W")

    for day in eventsList:
        date = day["day"]
        weekNumber = datetime.date(int(date[:4]), int(date[4:6]), int(date[6:])).strftime("%W")

        # find the corresponding week
        for i, week in enumerate(weekList):
            if week["week_nb"] == weekNumber:
                break
            elif i == len(weekList) -1:
                # create a new week
                weekList.append({"week_nb": weekNumber, "important": 0, "hours": 0, "days": [],"_sum":""})
                i = -1

        weekList[i]["important"] += day["important"]
        weekList[i]["hours"] += day["hours"]
        weekList[i]["_sum"] += day["_sum"]
        weekList[i]["days"].append(day)

    for week in weekList:

        # datetime format : YYYY-WweekNumber-dayNumberInWeek
        date = str(week["days"][0]["day"])[:4] + "-W" + str(week["week_nb"]) + "-1"
        date = datetime.datetime.strptime(date, "%Y-W%W-%w")

        week["start"] = str(date.date())
        week["end"] = str((date + datetime.timedelta(days=6)).date())

        # adding a list of the empty days
        week["empty_days"] = [0,1,2,3,4,5,6]
        for index, day in enumerate(week["days"]):
            # converting stored format to datetime format
            date = day["day"][:4] + "-" + day["day"][4:6] + "-" + day["day"][6:]
            date = datetime.datetime.strptime(date, "%Y-%m-%d")
            week["empty_days"].remove(date.weekday())

    # adding checksums
    for week in weekList:
        week["_sum"] += str(week["week_nb"])
        week["_sum"] = hashlib.md5(week["_sum"].encode()).hexdigest()

    eventsList.clear()
    for w in weekList:
        eventsList.append(w)


def addFileInfo(trueName):
    # adds checksum for the entire file + name of the file that have been extracted from ADE
    eventsList.append({"file_sum":"", "source_file":trueName})

    for week in eventsList[:-1]:
        eventsList[-1]["file_sum"] += week["_sum"]

        eventsList[-1]["file_sum"] = hashlib.md5(eventsList[-1]["file_sum"].encode()).hexdigest()



# main
def icsToJson(icsFile, jsonFile, trueName):

    with open(EXPORTS_FOLDER + "/" + icsFile, "r") as calcADE:
        # splits the calc into events, which are recognized by their 'BEGIN' label
        # also replaces end of lines followed by a space, which are simple returns in ics
        events = calcADE.read().replace("\n ", "").split("BEGIN")

        log("icsToJson", "Processing " + icsFile)

        # the first one is blank,  the second one is data about the file, we don't need those
        events.pop(0)
        events.pop(0)

        for event in events:
            eventsList.append(eventToDict(event))

    addInfo()
    addWeeks()
    addFileInfo(trueName)

    log("icsToJson", "Done. Writing output file to " + EXPORTS_FOLDER + "/" + jsonFile)

    with open(EXPORTS_FOLDER + "/" + jsonFile, "w") as calWrite:
        #calWrite.writelines(json.dumps(eventsList, ensure_ascii=False, indent="	").replace('\\\\', '\\'))

        edt_json = json.dumps(eventsList, ensure_ascii=False).replace('\\\\', '\\').replace(r'\,', ',')

        # on vérifie le Json généré
        PROTEC = 0
        while True:
            try:
                json.loads(edt_json)
                log("icsToJson", "Json is valid for " + jsonFile)
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

            finally:
                PROTEC += 1
                if PROTEC > 100:
                    log("icsToJson", "Failed to generate correct Json for '" + icsFile + "' aka '" + trueName + "'", True)
                    break

        calWrite.writelines(edt_json)



def log(tag : str, text : str, error=False):
    if error:
        logFile.write("\n{}\t- icsToJson:\t{}:\tERROR - {}".format(datetime.datetime.now(), tag, text))
    else:
        logFile.write("\n{}\t- icsToJson:\t{}:\tINFO  - {}".format(datetime.datetime.now(), tag, text))



def main():
    log("main", "Started.")

    with os.scandir(EXPORTS_FOLDER) as dirIt, open(PATH_FILE, "r") as pathFile:

        path = pathFile.readlines()

        for file in dirIt:
            file:os.DirEntry
            if not file.is_file():
                continue

            name, dot, ext = file.name.partition(".")

            if ext != "ics":
                continue

            lineNb = int(name)

            # nous avons éliminé tous les autres fichiers que ceux à exporter
            # on cherche maintenant le vrai nom du fichier pour le rajouter ensuite au json du fichier converti
            # son nom se trouve à la n-ième ligne correspondant à son nom

            trueName = path[lineNb - 1][:-1] # on exclut la fin de la ligne

            if not trueName.startswith("__"):
                # il y a un désaccord entre le path et le scraper, possible seulement lors de tests
                log("main", "line n°{} in {} should be a file not '{}' : cannot process file {}".format(lineNb, PATH_FILE, trueName, file.name))
                continue

            icsToJson(file.name, name + ".json", trueName)
            eventsList.clear() # reset



if __name__ == '__main__':
    with open("log.txt", "a") as logFile:
        try:
            main()
        except Exception:
            log("main", format_exc(), True)
            log("main", "Conversion failed.\n\r", True)
            sys.stdout.write("ERROR")
        else:
            log("main", "Finished.\n\r")
            sys.stdout.write("OK")
