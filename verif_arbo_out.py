
with open("arboADE_UTF-8.txt", "r", 1, encoding="utf-8") as arboScrap:
    with open("arboADE_corrected.txt", "w", 1, encoding="utf-8") as out:
        for line in arboScrap:
            if not (line.startswith("INFO_") or line.startswith("ERROR_")):
                out.write(line)
