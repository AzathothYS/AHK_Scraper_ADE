import sys, os


def scraper():
    launchCommand = "ArboScraper.exe"

    args = sys.argv[1:]

    if (args[0] == "--arboscrap" or "-as"):
        mode = 0
        launchCommand += " -arbo"
        args.pop()

        if not args[1].startswith("-"):
            launchCommand += " --path " + args.pop()

    elif (args[0] == "--pathscrap" or "-ps"):
        mode = 1
        launchCommand += " -path"
        args.pop()

        launchCommand += " --path " + args.pop()

    elif (args[0] == "--help" or "-h" or "?"):
        print("HELP :",
              "    --arboscrap (ou -as) [path] : scrap l'arborescence à partir de 'path' ou entièrement si 'path' n'est pas précisé\n",
              "    --pathscrap (ou -ps) path   : scrap les fichiers suivant le 'path' précisé\n",
              "    --out       (ou -o) file    : définit 'file' comme étant le fichier où les données seront enregistrées (mode arbo)\n"
              "    --debug     (ou -d)         : lance le script en admettant que ADE et le débuggeur sont déjà ouverts\n",
              "    --startup   (ou -s)         : force le script à ouvrir ADE au démarrage\n",
              "    --append    (ou -a)         : ajouter des lignes au fichier de sortie au lieu de l'effacer (mode arbo)\n",




              "tous les 'path' doivent faire référence à un fichier où se trouve le script, de la forme 'nomDuPath.txt'\n")
        return

    else:
        raise SyntaxError("No main mode specified")


    for i, arg in enumerate(args):
        if (arg == "--debug" or "-d"):
            launchCommand += " --debug"

        elif (arg == "--startup" or "-s"):
            launchCommand += " --startup"

        elif (arg == "--append" or "-a"):
            if mode == 0:
                raise ValueError("ERROR - Invalid parameter: {} - only used in 'arbo' mode ")
            launchCommand += " --append"

        elif (arg == "--out" or "-o"):
            if mode == 0:
                raise ValueError("ERROR - Invalid parameter: {} - only used in 'arbo' mode ")
            if i + 1 <= len(sys.argv) - 1:
                out = sys.argv[i]
                if out.startswith("-"):
                    raise Exception("ERROR - Invalid output file :" + str(out))
            else:
                raise Exception("ERROR - No output file specified.")

    print("Starting the script...")
    print("command sent :", launchCommand)
    os.system(launchCommand)



if __name__ == "__main__":
    print("running AHK ADE scraper...")
    scraper()
    print("Finished!")