
with open("arboADE_corrected.txt", "r",  1, encoding="utf-8") as arbo:
    charCount = 0
    moyenneToutesLignes = 0
    moyenneExces = 0
    nombreExces = 0

    maxChar = 0
    ligneMax = ""
    indexLigneMax = 0

    i = 0
    for line in arbo:
        charCount = len(line)

        moyenneToutesLignes += charCount

        if (charCount > 127):
            print("too much characters in line n°", i, ":", charCount, " - line : '" + line + "'")
            moyenneExces += charCount
            nombreExces += 1

        if (charCount > maxChar):
            maxChar = charCount
            ligneMax = line
            indexLigneMax = i

        i += 1

    moyenneToutesLignes /= i + 1
    moyenneExces /= nombreExces + 1

    print("Done.\n")
    print("Moyenne de char sur toutes les lignes :", moyenneToutesLignes)
    print("Moyenne de char sur les lignes avec plus de 127 char :", moyenneExces)
    print("Nombre de lignes dépassant 127 char :", nombreExces)
    print("Nombre de char max sur une ligne :", maxChar, " - numéro de la ligne :", indexLigneMax, " - ligne en question :",  ligneMax)




with open("arboADE_corrected.txt", "rb",  1) as arbo:
    byteCount = 0
    ligne = 0

    nbExces = 0

    maxBytes = 0
    ligneMax = 0

    totalByteCount = 0

    byte = arbo.read(1)
    while byte:
        totalByteCount += 1
        if (byte == b"\n"):

            if (byteCount >= 127):
                nbExces += 1

            if (byteCount > maxBytes):
                maxBytes = byteCount
                ligneMax = ligne

            ligne += 1
            byteCount = 0

        else:
            byteCount += 1

        byte = arbo.read(1)

    print("\n\nDone.\n")
    print("Moyenne de bytes par ligne : ", totalByteCount / ligne)
    print("Nombre de lignes avec plus de 127 chars :", nbExces)
    print("Ligne avec le plus de bytes :", ligneMax, "pour", maxBytes, "bytes.")