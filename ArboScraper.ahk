#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.

#UseHook, On
#SingleInstance,Force
#Include Lib\tf.ahk
FileEncoding, UTF-8
CoordMode, Pixel, Relative
CoordMode, Mouse, Relative

global startTime := A_TickCount

global P_debug := false, P_path := "", P_out := "", P_log = "", P_startup := false, P_append := false

global P_mode := -1 ; -1 : undefined, 0 : arborescence, 1 : get EdT via path

; default folders values
global DownLoads_Folder := "D:\Télécharments Chrome"
global EdT_Out_Folder := "EdTOut" ; dossier présent dans le dossier du script, il est créé autumatiquement sinon

global TEST_MODE := false ; debug

paramPrint := ""
Loop %0% {
	;parse the args given to the script at startup
	; the first argument must be either :
	; 	-arbo : the script acts in 'arborescence' mode, either starting at the end of the 'path' file or parsing the whole arborescence
	;	-path : the script acts in 'path' mode, parsing the 'path' file to get to specified files and download them
	; optional parameters : 
	; --debug : skip the startup
	; --path 'pathFile.txt' : start the script at the end of the specified path in the path file specified in 'arbo' mode, main working file in 'path' mode
	; --out 'outFile.txt' : outputs in the specified file
	; --startup : forces the script to launch ADE
	; --append : open 'outFile.txt' in append mode
	; --log 'logFile.txt' : outputs log into specified file, else default to scraper_log.txt
	; --dlfolder 'C:\Users\7\Downloads': to specify the absolute path to the folder where downloaded files of Chrome go, defaults to "D:\Télécharments Chrome"
	; --edtfolder 'EdTOut' : to specify the relative path (from the script directory) to the folder where EdT files are outputed
	
	param := %A_Index%
	paramIndex := A_Index
	
	paramPrint := paramPrint . " " . param
	
	If (SubStr(param, 1, 1) != "-")
		continue ; le paramètre n'est pas une commande
	
	If (param == "-arbo") {
		P_mode := 0
		
	} else if (param == "-path") {
		P_mode := 1
		
	} else if (param == "--path") {
		Loop %0% {
			If (A_Index == paramIndex + 1) {
				P_path := %A_Index%
			}
		}
		If (P_path == "") {
			MsgBox, , ArboScraper, Vous n'avez pas spécifié de path.
			Stop()
		}
		If (InStr(P_path, "/") or InStr(P_path, "\")) {
			MsgBox, , ArboScraper, % "Le path spécifié est incorrect. Il doit faire référence à un fichier se trouvant dans le dossier du script. " . P_path
			Stop()
		}
		
	} else if (param == "--out") {
		Loop %0% {
			If (A_Index == paramIndex + 1) {
				P_out := %A_Index%
			}
		}
		If (P_out == "") {
			MsgBox, , ArboScraper, Vous n'avez pas spécifié de fichier out.
			Stop()
		}
		
	} else if (param == "--log") {
		Loop %0% {
			If (A_Index == paramIndex + 1) {
				P_log := %A_Index%
			}
		}
		If (P_log == "") {
			MsgBox, , ArboScraper, Vous n'avez pas spécifié de fichier log.
			Stop()
		}
		
	} else if (param == "--dlfolder") {
		Loop %0% {
			If (A_Index == paramIndex + 1) {
				DownLoads_Folder := %A_Index%
			}
		}
		If (DownLoads_Folder == "") {
			MsgBox, , ArboScraper, Vous n'avez pas spécifié de dossier 'Téléchargements'
			Stop()
		}
		
	} else if (param == "--edtfolder") {
		Loop %0% {
			If (A_Index == paramIndex + 1) {
				EdT_Out_Folder := %A_Index%
			}
		}
		If (EdT_Out_Folder == "") {
			MsgBox, , ArboScraper, Vous n'avez pas spécifié de dossier 'EdT_Out'
			Stop()
		}
		
	} else if (param == "--debug") {
		P_debug := true
	} else if (param == "--startup") {
		P_startup := true
	} else if (param == "--append") {
		P_append := true
		
	} else if (param == "-h" or param == "-?" or param == "-help") {
		PrintHelp()
	} else if (param == "--SWAGG") {
		; SUPER SECRET LAZY STARTUP DEBUG MODE
		P_debug := true
		P_startup := false
		P_mode := 1
		P_path := "path.txt"
		P_log := "log.txt"
		
		TEST_MODE := true
	}
}


nbParams := %0%
If (nbParams == 0) {
	;if 0 parameters were passed to the script, print help
	PrintHelp()
}

If (P_mode == -1) {
	; uninitialized mode
	MsgBox, , ArboScraper, The mode must be specified (-arbo or -path)
	ExitApp
}

 ; on initialise les fichiers pour pouvoir logger dès que possible
global logFile := "", out := "", pathFile := ""
InitFiles()

DebugPrint("", "Script started with parameters: " . paramPrint . "`n", true)

global indent := "", arboX := 0, arboY := 0, arboFinX := 0, arboFinY := 0, lineHeight := 0, lineWidth := 0, devToolsX := 0, devToolsY := 0, coinScrollX := 0, coinScrollY := 0

global ADE_Height := "", ADE_Width := "" ; dimensions de la fenêtre d'ADE
global WIN_ADE := "ADE - ahk_class Chrome_WidgetWin_1", WIN_DEV := "Developer Tools ahk_class Chrome_WidgetWin_1" ; strings permettant d'identifier chaque fenêtre

If (P_mode == 1) {
	; initialisation des variables pour l'EdT scraping
	global exportButtonX := "", exportButtonY := "", dateChoiceX1 := "", dateChoiceX2 := "", dateChoiceY := "", okButtonX := "", okButtonY := ""
}

global pauseState := false, pauseX := 0, pauseY := 0

If (TEST_MODE) {
	Sleep 2000
}

If (P_startup) {
	DebugPrint("", "Starting the script in normal mode and startup mode", true)
	Startup()
}

If WinActive(WIN_ADE, , WIN_DEV) {
	
	Init()
	
	SetLineDims()
	
	SetDevToolsWinSize()
	
	If (TEST_MODE) 
		TestGuiLED()
	
	If (P_mode == 0) {
		DebugPrint("", "Starting in arbo scraping mode...", true)
		Main_Arbo()
	} else {
		DebugPrint("", "Starting in EdT scraping mode...", true)
		InitPathVars()
		Main_Path()
	}
	
	DebugPrint("", "Done.", true)
	Stop(false, false)
	
} else {
	MsgBox, 4, ArboScraper, Wrong window! Launch ADE ?
	IfMsgBox, Yes 
	{
		Startup()
		Reload
	}
	Stop()
}


InitFiles() {
	; initialisation des fichiers de log et output
	
	If (P_log == "") {
		P_log := "scraper_log.txt"
	}
	
	logFile := FileOpen(P_log, "a")
	
	If !IsObject(logFile) {
		MsgBox, , % "Can't open " . P_log . "!"
		ExitApp
	}
	
	If (P_mode == 0) {
		If (P_out == "") {
			P_out := "arbo_out.txt"
		}
		
		If (P_append) {
			out := FileOpen(P_out, "a")
			
		} else if (P_out == "arbo_out.txt" and P_path != "") {
			MsgBox, 4, ArboScraper, Reset arbo_out ?
			IfMsgBox,Yes
			{
				out := FileOpen(P_out, "w")
			} else {
				out := FileOpen(P_out, "a")
			}
			
		} else {
			out := FileOpen(P_out, "w")
		}
		
		If !IsObject(out) {
			DebugPrint("InitFiles", "Unable to open " . P_out . " !", false)
			Stop()
		}
		
	} else if (P_mode == 1) {
		If (P_path == "") {
			P_path := "path.txt"
		}
		
		pathFile := FileOpen(P_path, "r")
		
		If !IsObject(pathFile) {
			DebugPrint("InitFiles", "Can't open " . P_path . " !", false)
			Stop()
		}
	}
}


Startup() {
	;ouvre ADE et le DevTools dans chrome, et les met à une taille correcte
	
	CoordMode, Pixel, Screen
	
	Run, chrome.exe, , Min
	
	Sleep 2000
	
	;focus la nouvelle fenêtre créée
	ControlFocus, , Nouvel onglet - Google Chrome, Chrome Legacy Window, , Chrome Legacy Window`nChrome Legacy Window
	
	; on laisse la touche windows enfoncée pendant toute la manip
	SendInput, {LWin down}
	
	;on change la position de la fenêtre avec le racourci Win+Droite jusqu'a la position voulue
	pixelTop := 0x000000
	while(pixelTop != 0xFFFFFF) {
		ControlFocus, , Nouvel onglet - Google Chrome, Chrome Legacy Window, , Chrome Legacy Window`nChrome Legacy Window	;focus la nouvelle fenêtre
		Sleep 25
		SendInput, {Right}
		Sleep 200
		PixelGetColor, pixelTop, 5, 5
		
		If (A_Index == 5) {
			;la fenêtre est peut-être pas étendue jusqu'en haut
			ControlFocus, , Nouvel onglet - Google Chrome, Chrome Legacy Window, , Chrome Legacy Window`nChrome Legacy Window	;focus la nouvelle fenêtre
			Sleep 25
			SendInput, {Up}
			Sleep 20
		}
		
		If (A_Index > 10) {
			SendInput, {LWin up}
			Sleep 50
			MsgBox, , ArboScraper, Unable to get the window to the correct position!
			Stop()
		}
	}
	
	SendInput, {LWin up}
	Sleep 500
	SendInput, !{Tab} ;alt tab pour sortir du mode "choix de la fenêtre à mettre à côté" qui fait chier car rien d'autre ne peut l'empêcher
	Sleep 500
	ControlFocus, , Nouvel onglet - Google Chrome, Chrome Legacy Window, , Chrome Legacy Window`nChrome Legacy Window
	Sleep 1000
	SendInput,  https://planning.univ-rennes1.fr/direct/myplanning.jsp
	Sleep 50
	SendInput, {Enter}
	Sleep 5000
	
	CoordMode, Pixel, Relative
	
	;si ADE nous demande de se connecter
	ImageSearch, loginX, loginY, 0, 0, 750, 1000, Images\ecranConnection2.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search for ecranConnection2.png!
		Stop()
	} else if (ErrorLevel == 0) {
		SendInput, {Tab 2}
		Sleep 50
		SendInput, {Enter}
		Sleep 2000
	}
	
	;on attend qu'ADE charge
	pixelADE := 0x000000
	while(pixelADE != 0x4C829B) {
		Sleep 100
		PixelGetColor, pixelADE, 10, 100, RGB
		
		If (A_Index > 100) {
			MouseMove, 10, 100
			MsgBox, , ArboScraper, % "Timeout : ADE didn't load? pixel:" . pixelADE
			Stop()
		}
	}
	
	Sleep 500
	SendInput, {F12 down}
	Sleep 50
	SendInput, {F12 up}
	Sleep 1000
	
	;waiting for DevTools
	Loop {
		Sleep 100
		WinGetActiveTitle, title
		
		If(InStr(title, "Developer Tools")) {
			Break
		}
		
		If (A_Index > 50) {
			MsgBox, , ArboScraper, %  "Unable to open or find DevTools! active window :" . title
			Stop()
		}
	}
	
	Sleep 100
	WinMove, Developer Tools, , 10, 10, 800, 256
	Sleep 250
	
	;on s'assure que l'onglet 'Elements' est actif
	ImageSearch, elementsX, elementsY, 0, 0, 800, 256, Images\devToolsElements.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search devToolsElements.png!
		Stop()
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Couldn't find devToolsElements.png!
		Stop()
	} 
	MouseMove, elementsX + 5, elementsY + 5
	Click
	Sleep 500
	
	;on enlève l'affichage des 'Styles', pour qu'il ne ralentisse pas le scraping
	ImageSearch, styleSwitchX, styleSwitchY, 400, elementsY + 5, 800, 256, *50 Images\switchStyleDevTools.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search switchStyleDevTools.png!
		Stop()
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Couldn't find switchStyleDevTools.png!
		Stop()
	}
	
	MouseMove, styleSwitchX + 3, styleSwitchY + 3
	Click
	Sleep 250
	MouseMove, 0, 80, 5, R		;on selectionne 'DOM BreakPoints', car il n'affiche rien du tout
	Sleep 50
	Click
	Sleep 100
	
	; si la fenêtre de la console est ouverte, on clique sur la croix pour la fermer
	ImageSearch, croixX, croixY, 750, elementsY + 100, 800, 256, *50 Images\devToolsConsoleCross.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search devToolsConsoleCross.png!
		Stop()
	} else if (ErrorLevel != 1) {
		MouseMove, croixX + 3, croixY + 3
		Sleep 20
		Click
		Sleep 500
	}
	
	Winset, Alwaysontop, ON, A	;d'une certaine manière cela permet aussi d'accélérer le processus
	Sleep 250
	
	;on revient sur ADE
	ControlFocus, , ADE - Default, , Developer Tools
	Sleep 250
	
	;on agrandit l'arborescence
	ImageSearch, resizeStartX, resizeStartY, 200, 500, 500, 800, Images\limiteListeADE.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search for limiteListeADE.png!
		Stop()
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Couldn't find limiteListeADE.png!
		Stop()
	}
	
	MouseMove, resizeStartX + 5, resizeStartY, 5
	Sleep 50
	Click down
	Sleep 100
	MouseMove, 800, 0, 7, R
	Sleep 100
	Click up
	Sleep 1000
}


Init() {
	; init des dimensions de la fenêtre d'ADE
	WinGetPos, , , ADE_Width, ADE_Height, %WIN_ADE%, , %WIN_DEV%
	
	; init for arbo dims
	
	FindStartingPosOfArbo()
	
	If (false) {
		; ANCIENNE MÉTHODE - À SUPPRIMMER - (DEBUG)
		
		ImageSearch, arboX, arboY, 0, 0, 1000, 1000, Images\nom_liste_dossiers.png
		
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Could not search for image : nom_liste_dossiers.png
			Stop()
		} else if (ErrorLevel == 1) {
			MsgBox, , ArboScraper, Image not found : nom_liste_dossiers.png
			Stop()
		}
		
		arboX := arboX - 10
		arboY := arboY + 10
		
		DebugPrint("Init", "Values for init : " . arboX . " - " . arboY, true)
	}
	
	ImageSearch, arboFinX, arboFinY, arboX, arboY, 1000, 1000, Images\scrollBasOn.png
	
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search for image : scrollBasOn.png
		Stop()
	} else if (ErrorLevel == 1) {
		
		ImageSearch, arboFinX, arboFinY, arboX, arboY, 1000, 1000, Images\scrollBasOff.png
		
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Could not search for image : scrollBasOff.png
			Stop()
		} else if (ErrorLevel == 1) {
			MsgBox, , ArboScraper, Image not found : scrollBasOff.png
			Stop()
		}
	}
	
	arboFinX := arboFinX - 10 
	arboFinY := arboFinY - 10
	
	;coord du coin en bas à droite de la liste
	ImageSearch, coinScrollX, coinScrollY, arboFinX - 5, arboFinY - 5, arboFinX + 30, arboFinY + 30, Images\coinScrollBas.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search for image : coinScrollBas.png
		Stop()
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Could not find image : coinScrollBas.png
		Stop()
	}
	
	coinScrollX += 3
	coinScrollY += 3
}

FindStartingPosOfArbo_OLD() {
	; on commence par l'axe Y
	
	ControlFocus, , ADE - Default, , Developer Tools
	Sleep 25
	
	x := 100
	y := 350
	
	MouseMove, x, y, 8
	
	PixelGetColor, color, x - 1, y - 1, RGB
	If (ErrorLevel == 1) {
		DebugPrint("FindStartingPosOfArbo", "Could not get pixel color at " . (x - 1) . " - " . (y - 1), false)
		Stop()
	}
	
	found := false
	PROTEC := 0
	; on charche la couleur de la ligne 'Nom' lorsqu'elle est sélectionnée, puis dès que l'on trouve on continue jusqu'à ne plus la trouver, on sera donc au début de la 1ère ligne de l'arborescence
	while (color != 0xFEDFB7 or found) {
		If (found) {
			MouseMove, 0, 1, 4, R
			y += 1
		} else {
			MouseMove, 0, 5, 4, R
			y += 5
		}
		
		PixelGetColor, color, x - 1, y - 1, RGB
		
		If (found and color != 0xFEDFB7)
			Break
		else if (color == 0xFEDFB7)
			found := true
		
		PROTEC += 1
		If (PROTEC > 500) {
			; erreur
			DebugPrint("FindStartingPosOfArbo", "Could not find first line Y pos (last color: " . color . ")", false)
			Stop()
		}
	}
	
	
	MouseMove, 0, -2, 4, R ; on resélectionne la barre
	Sleep 25
	PixelGetColor, color, x - 1, y - 1, RGB
	
	; on a trouvé la position en y, maintenant pour la position en X : dès que la couleur est dans la tainte de gris, on s'arrête
	PROTEC := 0
	while (color > 0xEEEEEE) {
		MouseMove, -2, 0, 4, R
		x -= 2
		PixelGetColor, color, x - 1, y - 1, RGB
		
		PROTEC += 1
		If (PROTEC > 200) {
			; erreur
			DebugPrint("FindStartingPosOfArbo", "Could not find first line X pos (last color: " . color . ")", false)
			Stop()
		}
	}
	
	arboX := x + 1
	arboY := y + 1
	
	MouseMove, 0, -50, 0, R
	Sleep 50
	
	DebugPrint("FindStartingPosOfArbo", "Output of ver.1: " . arboX . " - " . arboY, true)
	
	FindStartingPosOfArbo()
}

FindStartingPosOfArbo() {
	
	ControlFocus, , %WIN_ADE%, , %WIN_DEV%
	Sleep 25
	
	x := 100
	y := 350
	
	MouseMove, x, y, 8
	
	PixelGetColor, color, x - 1, y - 1, RGB
	while (color != 0xFEDFB7) {
		MouseMove, 0, 8, 4, R
		y += 8
		PixelGetColor, color, x - 1, y - 1, RGB
		
		PROTEC += 1
		If (PROTEC > 50) {
			; erreur
			DebugPrint("FindStartingPosOfArbo", "Could not find first line Y pos (last color: " . color . ")", false)
			Stop()
		}
	}
	
	PixelSearch, , y, x - 1, y + 30, x - 1, y - 1, 0xFEDFB7, 0, RGB ; recherche depuis le bas, pour trouver le dernier pixel de la ligne sélectionnée
	
	; on a sélectionné la barre, on cherche maintenant ses limites dans le coin en bas à gauche
	PixelSearch, arboX, arboY, 20, y + 10, 100, y - 10, 0xFEDFB7, 0, RGB ; recherche en inversant le sens de recherche dans l'axe y
	
	arboX += 1
	arboY += 3 ; cette méthode a un offset de 2 par rapport  à l'ancienne
	
	MouseMove, arboX, arboY - 50
	Sleep 50
}

SetLineDims() {
	MouseMove, 25, -25, 0, R
	Sleep 50
	
	ImageSearch, flecheX, flecheY, arboX, arboY, arboFinX, arboFinY, *TransBlack Images\flecheOff.png
	If (ErrorLevel == 2) {
		DebugPrint("SetLineDims", "Could not search for image : flecheOff.png", false)
		Stop()
	} else if (ErrorLevel == 1) {
		DebugPrint("SetLineDims", "Unable to find flecheOff.png", false)
		Stop()
	}
	
	lineHeight := flecheY
	lineWidth := flecheX
	
	MouseMove, flecheX + 3, flecheY + 3, 0
	Sleep 25
	Click
	Sleep 500
	MouseMove, arboX, arboY
	Sleep 500
	
	; cette search plante quelques fois, j'ai fait bouger la souris avant le check, fixé ou non ?
	ImageSearch, flecheX, flecheY, lineWidth + 10, lineHeight + 10, arboFinX, arboFinY, *TransBlack Images\flecheOff.png
	If (ErrorLevel == 2) {
		DebugPrint("SetLineDims", "Could not search for image : flecheOff.png (2)", false)
		Stop()
	} else if (ErrorLevel == 1) {
		DebugPrint("SetLineDims", "Unable to find flecheOff.png after " . lineWidth " and " . lineHeight . " (2)", false)
		Stop()
	}
	
	lineHeight := flecheY - lineHeight
	lineWidth := flecheX - lineWidth
	
	If (lineHeight < 10) {
		DebugPrint("SetLineDims", "Error : lineHeight is too small (" . lineHeight . ")", false)
		Stop()
	}
	If (lineWidth < 10) {
		DebugPrint("SetLineDims", "Error : lineWidth is too small (" . lineHeight . ")", false)
		Stop()
	}
	
	; on ferme les dossiers ouverts avant de continuer
	
	MouseMove, flecheX - lineWidth + 3, flecheY - lineHeight + 3, 0
	Sleep 50
	Click
	Sleep 500
}


SetDevToolsWinSize() {
	
	SendInput {F12}
	Sleep 500
	
	If (WinActive("ahk_exe chrome.exe", , "ADE - Default")) {
		;dev tools is the active window
		WinGetPos, , , devToolsX, devToolsY 
	} else {
		MsgBox, , ArboScraper, Unable to find the Developer Tools window
		Stop()
	}
	
	ControlFocus, , ADE - Default, , Developer Tools
	
	Sleep 200
}



Main_Arbo() {	
	
	ControlFocus, , ADE - Default, , Developer Tools
	
	MouseMove, -5, -50, 0, R
	
	Sleep 500
	
	If (P_path != "") {
		UpdateIndent(0)
		
		pathLength := 0
		
		y := StartAtPath(pathLength)
		y := PreciseLine(y + lineHeight, 5)
		
		DebugPrint("Main_Arbo", "indent : '" . indent . "' soit " . countIndents(indent) . " indentations.", true)
		
		pathLength -= 1
		
		x := arboX
		Loop %pathLength% {
			x += lineWidth
			UpdateIndent(x)
		}
		
		DebugPrint("Main_Arbo", "indent final : " . countIndents(indent) . " pour un path de " . pathLength . " de longueur.", true)
		
	} else {
		y := GetFirstLine(5)
	}
	
	x := arboX
	
	progression := 0 		;0 pour début, 1 pour plus de scroll possible, 2 pour plus de lignes (donc fini)
	currentLineError := 0
	nbLignes := 0
	currentLine := ""
	siDossierEnFinDeLigne := false	;true si l'on se trouve tout à la fin de l'arborescence, chaque scroll va alors être vérifié, car ADE bug souvent
	siDossierJusteAvant := false		;si on a un fichier juste après un sous-dossier vide dans un dossier, l'indent sera foiré
	while (currentLineError < 5) {
		
		If (pauseState) {
			;on pause le script
			PauseScript()
		}
		
		isFolder := IsFolderAt(y, x, 5) 	;also updates the pos of x
		
		MouseMove, x + 3, y + 10, 0
		
		If (currentLineError == 0) {
			;on n'update l'indent et enregistre le nom du fichier qu'une seule fois
			UpdateIndent(x)
			
			currentLine := GetName(5, isFolder)
			out.WriteLine(indent . currentLine)		;get the name of the file and append it with the correct indent to arbo_out
		}
		
		If (isFolder) {
			MouseMove, -16, 0, 0, R
			Sleep 50
			Click
			
			If (!WaitFolderLoad(y)) {
				;restart this line
				DebugPrint("Main_Arbo", "restarting line", true)
				y := PreciseLine(y, 5)
				currentLineError += 1
				Continue
			}
			
			If (y - arboY > (arboFinY - arboY) * 0.9) {
				;si on a un dossier sur la dernière ligne, quand on va l'ouvrir le prochain scroll sera foiré
				ImageSearch, , , arboX, y + lineHeight, arboX + 5, y + lineHeight + 3, Images\ADEblue.png
				If (ErrorLevel == 2) {
					MsgBox, , ArboScraper, ERROR : Unable to search ADEblue.png
					Stop()
				} else if (ErrorLevel == 0) {
					DebugPrint("Main_Arbo", "On a un dossier en fin de liste", true)
					siDossierEnFinDeLigne := true
				}
			}
		}
		
		If (y - arboY > (arboFinY - arboY) * 0.9) {
			;need to scroll
			If (!ScrollDown()) {
				DebugPrint("Main_Arbo", "no more scrolling possible", true)
				progression := 1
			} else {
				Sleep 100
				If (progression == 1) {
					progression := 0
					DebugPrint("Main_Arbo", "scrolling possible! Continuing...", true)
				}
				
				y := ManageUnusualScrolls(y, currentLine, siDossierEnFinDeLigne)
			}
		}
		
		nbLignes += 1
		; reload ADE to minimize the lag
		If (nbLignes > 100 and isFolder) {			
			path := getPathToRemember()
			
			WriteThePath(path)
			
			closeAllTheFolders()
			
			y := ReadThroughThePath(path)
			
			nbLignes := 0
			path :=
		}
		
		y := PreciseLine(y + lineHeight, 5)	;passe à la ligne suivante, puis recentre y sur une ligne
		
		If (progression == 1) {
			ImageSearch, , , arboX, y, arboX + 5, y + 3, Images\ADEblue.png
			If (ErrorLevel == 2) {
				MsgBox, , ArboScraper, ERROR : Unable to search ADEblue.png
				Stop()
			} else if (ErrorLevel == 0) {
				DebugPrint("Main_Arbo", "ADE blue found! ENDING scraping", true)
				Break 	;fin de l'arborescence
			}
		}
		
		currentLineError := 0
		siDossierJusteAvant := isFolder
	}
	DebugPrint("Main_Arbo", "nbLignes=" . nbLignes, true)
	out.WriteLine("END")
}


GetFirstLine(errNb) {
	
	ControlFocus, , ADE - Default, , Developer Tools
	
	MouseMove, arboX + 50, arboY + 50, 0
	
	return arboY ; DEBUG : ça devrait fonctionner mieux ?
	
	errMessage := ""
	If !(WinActive("ahk_class Chrome_WidgetWin_1", , "Developer Tools")) {
		errMessage .= " - Wrong Window!"
	}
	
	ImageSearch, , y, arboX - 5, arboY - 5, arboX + lineWidth * 4, arboY + lineHeight, Images\firstLine2.png 	;init y
	If (ErrorLevel > 0 and errNb > 0) {
		;try again
		DebugPrint("GetFirstLine", "couldn't find the first line! " . errNb . errMessage, false)
		Sleep 250
		
		If (errNb == 2) {
			; on essaye avec une autre technique
			; on cherche cette fois la couleur du centre de l'image des dossiers
			PixelSearch, , y, arboX - 5, arboY - 5, arboX + lineWidth * 4, arboY + lineHeight, 0xFFF986, 64, Fast RGB
			If (ErrorLevel == 2) {
				DebugPrint("GetFirstLine", "Unable to search for pixel color", false)
				Stop()
			} else if (ErrorLevel == 1) {
				DebugPrint("GetFirstLine", "Couldn't find pixel of folders' image", false)
				MsgBox, , ArboScraper, Cannot find pixel of first line! DEBUG SEARCH..., 3
				DebugImageSearch(arboX - 5, arboY - 5, arboX + lineWidth * 4, arboY + lineHeight)
			} else {
				DebugPrint("GetFirstLine", "Successfully found pixel of folders' image", true)
				return y
			}
		}
		
		If (errNb == 1) {
			DebugPrint("GetFirstLine", "giving up! Returning :" . (arboY + 5), false)
			return arboY + 5
		}
		
		return GetFirstLine(errNb -1)
		
	} else if (ErrorLevel == 2) {
		MsgBox, , ArboScraper, % "ERROR : Unable to search firstLine2.png with : (" arboX - 5 ", " arboY - 5 ", " arboX + lineWidth * 4 ", " arboY + lineHeight ")"
		ControlFocus, , ADE - Default, , Developer Tools
		Sleep 1000
		DebugImageSearch(arboX - 5, arboY - 5, arboX + lineWidth * 4, arboY + lineHeight)
		Stop()
		
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, % "ERROR : Couldn't find firstLine2.png with : (" arboX - 5 ", " arboY - 5 ", " arboX + lineWidth * 4 ", " arboY + lineHeight ")"
		ControlFocus, , ADE - Default, , Developer Tools
		Sleep 1000
		DebugImageSearch(arboX - 5, arboY - 5, arboX + lineWidth * 4, arboY + lineHeight)
		Stop()
	}
	
	return y
}


ScrollDown() {
	;si la flèche est noire, on peut scroller, sinon, non.
	
	ImageSearch, , , arboFinX, arboFinY, arboFinX + 20, arboFinY + 20, Images\scrollBasOn.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search scrollBasOn.png
		Stop()
	} else {
		;on cherche si on ne trouve pas la couleur de la flèche du scroll, pour être sûr
		PixelSearch, , , arboFinX, arboFinY, coinScrollX, coinScrollY, 0x505050, , Fast RGB
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Could not search for pixels!
			Stop()
		} else if (ErrorLevel == 1) {
			return false
		}
	}
	
	SendInput, {WheelDown}
	return true
}


IsFolderAt(y, ByRef x, errNb, folderCanBeOpened:=false) {
	;true if it is a folder, false if it is a file, 2 if it is an open folder
	
	;only used in ManageUnusualScrolls
	If (folderCanBeOpened) {
		ImageSearch, x, , arboX, y, arboFinX - 10, y + lineHeight, *TransBlack Images\flecheOn.png
		
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Could not search for image : flecheOn.png
			Stop()
		} else if (ErrorLevel == 0) {
			x += 14
			return 2
		}
	}
	
	ImageSearch, x, , arboX, y, arboFinX - 10, y + lineHeight, *TransBlack Images\flecheOff.png
	
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search for image : flecheOff.png
		Stop()
	} else if (ErrorLevel == 0) {
		x += 14	;offset pour localiser l'icône du dossier, et donc sa position horizontale dans l'arborescence
		return true
	}
	
	ImageSearch, x, , arboX, y, arboFinX - 10, y + lineHeight, *TransBlack Images\fichierADE.png
	
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search for image : fichierADE.png
		Stop()
	} else if (ErrorLevel == 1) {
		If (errNb != 0) {
			MouseMove, 0, -15, 0, R
			return IsFolderAt(y, x, errNb - 1) 	;retry
		} else {
			; debug
			DebugPrint("IsFolderAt", "Unable to analyse line " . y . " because there is nothing to see here i swear", false)
			MsgBox, , ArboScraper, ERROR : nothing to analyse at line : y=%y% - ymax= %lineHeight%
			Stop()
		}
	}
	
	return false
}

;to remove
findStartingLineX(y) {
	y += 6
	x := arboX
	
	while (x < arboFinX) {
		x++
		PixelGetColor, pixelColor, x, y, RGB
		
		If (pixelColor != 0xFFFFFF) {
			;DebugPrint("findStartingLineX", "found line starting point at x=" . x, true)
			return x
		}
	}
	
	DebugPrint("findStartingLineX", "Couldn't find starting line point at y=" . y, false)
	MsgBox, , ArboScraper, % "Couldn't find starting line point at y=" . y
	Stop()
}


ManageUnusualScrolls(y, lineToFind, siDossierEnFinDeLigne) {
	;si la flèche de scroll en bas est noire, alors le scroll était complet puisque l'on peut toujours scroller
	;sinon, le scroll est incomplet, alors on doit rechercher la ligne où on était avant de scroller
	
	Sleep 250
	
	y := PreciseLine(y, 5)
	
	ImageSearch, , , arboFinX, arboFinY, arboFinX + 20, arboFinY + 20, Images\scrollBasOn.png
	
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Could not search scrollBasOn.png
		Stop()
	} else if (ErrorLevel == 0 and !siDossierEnFinDeLigne) {
		;on a monté de 3 lignes
		MouseMove, 0, - lineHeight * 3, 0, R
		y := PreciseLine(y - lineHeight * 3, 5)
		return y
	}
	
	;le scroll était incomplet, on recherche dans les 10 lignes au-dessus la ligne où l'on était
	
	x := 0
	Loop 10 {
		isFolder := IsFolderAt(y, x, 5, true)
		If (isFolder == 2)
			isFolder := true
		
		MouseMove, x + 3, y + 10
		Sleep 125
		lineName := GetName(5, isFolder)
		
		If (lineName == lineToFind) {
			y := PreciseLine(y, 5)
			MouseMove, arboX, y
			return y
		} else {
			MouseMove, 0, lineHeight, 0, R
			y := PreciseLine(y - lineHeight, 5)
		}
	}
	
	DebugPrint("ManageUnusualScrolls", "Unable to find currentLine after scrolling!", false)
	MsgBox, , ArboScraper, Unable to find lineToFind after scrolling! `n %lineToFind%
	Stop()
}



UpdateIndent(x) {
	static previousX := 1000			;preventing the first indent to be 4 spaces
	
	If (x > previousX + 5) {
		indent := indent . "    " 	;add 4 spaces at the end of the indentation, can only be one indent
		
	} else if (x < previousX) {
		nbUp := Floor((previousX - x) / lineWidth) ; nb of step ups
		
		indent := SubStr(indent, 1, StrLen(indent) - (4 * nbUp))	;removes 4 spaces of the indentation by step up
	}
	
	previousX := x
}


GetName(errNb, isFolder) {
	
	If (errNb < 0) {
		MsgBox, , ArboScraper, ERROR : unable to retrieve the name for this element...
		Stop()
	}
	
	WinGetActiveTitle, title
	If (InStr(title, "ADE - Default") == 0) {
		;wrong window!
		DebugPrint("PreciseLine", "wrong window! : " . title, false)
		ControlFocus, , ADE - Default, , Developer Tools
	}
	
	Clipboard =
	
	Sleep 25
	SendInput, ^+c			;inspect on
	Sleep 125				;prevent some lag issues
	
	MouseMove, 20, 4, 7, R	;hover file name
	Sleep 100
	
	If !(isPixelBlue(2)) {
		;pixel isn't blue, selection failed
		SendInput, ^+c		;inspect off
		Sleep 200
		MouseMove, -20, -4, 7, R
		Sleep 100
		
		; si l'inspection est inversée, on clique à côté pour la désactiver
		MouseMove, arboFinX + 50, 0, 5, R
		Sleep 100
		Click
		Sleep 100
		MouseMove, -arboFinX - 50, 0, 5, R
		Sleep 100
		
		If (errNb < 4) {
			MouseMove, 20, 0, 0, R	;on se décale, si jamais 'x' n'était pas bien positionné
		}
		
		return GetName(errNb -1, isFolder)
	}
	
	Sleep 50
	Click				;to get the element in dev tools (+ inspect off)
	Sleep 50
	
	If (WinActive("ahk_exe chrome.exe", , "ADE - Default")) {
		;dev tools is the active window
		
		while (true) {
			ImageSearch, , , 20, 20, 50, devToolsY - 30, Images\devToolsBlueSelected.png
			
			If (ErrorLevel == 2) {
				MsgBox, , ArboScraper, Unable to find devToolsBlueSelected.png!
				Stop()
			} else if (ErrorLevel == 0) {
				Break
			}
			
			Sleep 25
			
			If (A_Index > 120) {	;3 sec
				MsgBox, , ArboScraper, ERROR : Timeout while waiting for dev tools to select the element!
				Stop()
			}
		}
	}
	
	Sleep  60
	SendInput, ^c			;take the element
	ClipWait, 0.5
	
	if (ErrorLevel) {
		; the clipboard never got filled, reset and try again
		MouseMove, -20, -4, 0, R
		Sleep 25
		ControlFocus, , ADE - Default, , Developer Tools
		Sleep 200
		return GetName(errNb -1, isFolder)
	}
	
	name := Clipboard
	name := RegExReplace(name, "&amp;", "&")					;replaces the '&' in html to a normal '&'
	name := RegExReplace(name, "(<.+\"">)|(<\/span>)|(<\/div>)")	;removes the span nodes and add to the output with an indentation (remainder : " is the escape for ")
	
	MouseMove, -20, -4, 0, R	;return to initial pos
	Sleep 10
	ControlFocus, , ADE - Default, , Developer Tools				;switch to the chrome window that isn't the devtool one, aka ADE
	Sleep 10
	
	If (isFolder) {
		return name
	} else {
		return "__" . name	;add '__' before the name to mark it as a file
	}
}


WaitFolderLoad(y) {
	MouseMove, -30, 0, 0, R
	
	Sleep 100
	
	he_protec := 0
	while(true) {
		ImageSearch, , , arboX, y - 5, arboFinX, y + lineHeight, *TransBlack Images\flecheOff.png
		
		if (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Unable to search flecheOff.png
			Stop()
		} else if (ErrorLevel == 1) {
			return true
		} else {
			Sleep 10
		}
		
		he_protec += 1
		if (he_protec > 100) {
			DebugPrint("WaitFolderLoad", "timeout", false)
			return false
		}
	}
}


isPixelBlue(errNb) {
	;if the pixel is quite blue -> click, else move the cursor around to force and wait for the update of the inspect tool
	
	MouseGetPos, curPosX, curPosY
	PixelGetColor, nameColor, curPosX - 2, curPosY, RGB
	
	If (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Problem with pixelGetColor!
		DebugPrint("isPixelBlue", "pixelGetColor failed at " . curPosX . " - " . curPosY, false)
		Stop()
	}
	
	If (RegExMatch(nameColor, "0x(?<color>[[:xdigit:]]{2})(\k<color>){2}") == 0) {
		;pixel color isn't grey (regex didn't matched), but does it have a high value of blue ?
		;black color with blue filter : 0x496F91
		;white color with blue filter : 0xA0C6E8
		;all shades of grey and 'yellow selected' are included in this range
		
		If (nameColor >= 0x496F91 and nameColor <= 0xA0C6E8) {
			return true
		}
	}
	;else
	;pixel color is grey  (blue = red = green), and so not selected, or is not a valid shade of blue
	
	Sleep 25
	MouseMove, 50, 0, 5, R
	Sleep 25
	MouseMove, -50, 0, 5, R
	Sleep 50
	
	If (errNb > 0) {
		DebugPrint("isPixelBlue", "text wasn't blue :( -> " . errNb, false)
		return isPixelBlue(errNb -1)
	} else {
		DebugPrint("isPixelBlue", "couldn't make the text blue!", false)
		return false
	}
}


PreciseLine(y, errNb) {
	
	WinGetActiveTitle, title
	If (InStr(title, "ADE") == 0) {
		;wrong window!
		DebugPrint("PreciseLine", "wrong window! : " . title, false)
		ControlFocus, , %WIN_ADE%, , %WIN_DEV%
		Sleep 25
	}
	
	;first errNb is always 5
	ImageSearch, , new_y, arboX, y - errNb, arboX + errNb, y + errNb, *errNb*5 Images\lineBorder.png			;on précise y en cherchant la bordure de ligne exacte autour de y (mesure de sécurité)
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, ERROR : Unable to search lineBorder.png
		Stop()
	} else if (ErrorLevel == 1) {
		
		ImageSearch, , new_y, arboX, y - errNb, arboX + errNb, y + errNb, Images\lineSelectedBorder.png	;la ligne a peut-être été sélectionnée
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, ERROR : Unable to search lineSelectedBorder.png
			Stop()
		} else if (ErrorLevel == 1) {
			
			If (errNb < 10) {
				DebugPrint("PreciseLine", errNb, false)
				return PreciseLine(y, errNb + 1) 	;retry with a larger area
				
			} else {				
				DebugPrint("PreciseLine", "failed to find the line at " . y, false)
				
				If (!TestADEcrash()) {
					DebugPrint("PreciseLine", "ADE n'a pas crashé", true)
					MsgBox, , ArboScraper, ERROR : Couldn't find line at %y%
					Stop()
				}
			}
		}
	}
	return new_y
}



closeAllTheFolders() {
	;searches an impossible file name, closing all of the folders in the process
	
	;MsgBox, , ArboScraper, closeAllTheFolders start..., 1
	
	Sleep 2000
	
	ImageSearch, searchX, searchY, arboFinX - 125, arboY - 100, arboFinX - 30, arboY - 20, Images\searchBar.png
	
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search searchBar.png!
		Stop()
	} else if (ErrorLevel == 1) {
		MsgBox, , ArboScraper, Couldn't find searchBar.png!
		
		Stop()
	}
	
	MouseMove, searchX, searchY + 10, 1
	
	Sleep 500
	
	MouseMove, arboX, searchY + 10, 1	;move to search bar
	Sleep 25
	Click
	Sleep 50
	SendInput, chose impossible à trouver pour tout refermer
	Sleep 200
	SendInput, {Enter}
	Sleep 1000
	MouseClick, Left, 0, -3, 1, 1, , R	;select all the text and delete it
	Sleep 200
	MouseClick, Left
	Sleep 200
	MouseClick, Left
	Sleep 500
	SendInput, {Delete}
	
	;wait for all the folders to close (0 éléments trouvés toast ?)
	
	waiting := true
	while (waiting) {
		ImageSearch, , , arboX - 25, arboFinY - 40, arboFinX + 10, arboFinY + 50, Images\zeroElementTrouveRecherche.png
		
		If (ErrorLevel == 2) {
			MsgBox, , ArboScraper, Unable to search zeroElementTrouveRecherche.png!
			Stop()
		} else if (ErrorLevel == 0) {
			waiting := false
		}
		
		Sleep 500
		
		If (A_Index > 90) {  ;1 min
			DebugPrint("closeAllTheFolders", "timeout", false)
			MsgBox, , ArboScraper, ERROR : Timeout for closeAllTheFolders!
			Stop()
		}
	}
	
	MouseMove, arboX, arboY, 0
	
	Sleep 5000
	
	return true
}


getPathToRemember(outFile := "") {
	;get the path to the folder where the scraper left off
	;called before 'closeAllTheFolders'
	
	out.close()	;save the file
	
	If (outFile != "") {
		outTF := TF(outFile, "outTF")
	} else {
		outTF := TF(P_out, "outTF")	;create a TF object to iterate in reverse
	}
	
	out := FileOpen(P_out, "a")	; re-open the file
	
	If !IsObject(out) {
		MsgBox, , % "Cannot append to " . P_out . "!"
		ExitApp
	}
	
	DebugPrint("getPathToRemember", "saving memory by closing the unused files...", true)
	
	fileWhereWeStoppedAt := TF_Tail(outTF, 1, 1, 0)	;get the last line, ignores every blank line and doesn't add a newline character
	
	pathToFollow := Object()		;array for the path to follow, iterated in reverse
	i := 1				;the number of lines to until the target file is reached, that will be added to the array for each sub-directory
	
	nbOf4Spaces := countIndents(fileWhereWeStoppedAt)	;get the initial number of indents	
	
	pathToFollow.Push(RegExReplace(fileWhereWeStoppedAt, "( {4})"))	;removes the indents and add the target file at the end of the path, to check if we arrived at the right place
	
	nbOfLines := TF_CountLines(outTF)
	RIndex := 1 	;reverse index of the file
	while (RIndex -1 < nbOfLines) {	;while we're not at the start of the file
		RIndex++
		currentLine := TF_Tail(outTF, - RIndex, 1)		;read the 'RIndex' line from the end of the file
		
		If (InStr(currentLine, "ERROR_", true) or InStr(currentLine, "INFO_", true)) {
			;it is an error or an info line, so it must be ignored
			Continue
		}
		
		currentNbOf4Spaces := countIndents(currentLine)
		
		If (currentNbOf4Spaces == nbOf4Spaces) {
			;une ligne du dossier contenant le dossier où l'on se trouvait
			lastValidLine := currentLine
			i++
		} else if (currentNbOf4Spaces < nbOf4Spaces) {
			;on arrive dans un dossier plus bas dans l'arborescence, celui qui nous contenait
			;on se déplace donc avec 4 espaces de moins
			pathToFollow.Push(i)
			pathToFollow.Push(RegExReplace(currentLine, "( {4})"))
			nbOf4Spaces := currentNbOf4Spaces
			i := 1
		}
		
		If (A_Index > 10000) {
			DebugPrint("getPathToRemember", "Unable to create path! Stuck in while-loop!", false)
			MsgBox, , ArboScraper, ERROR : Unable to create path! Stuck in while-loop!
			Stop()
		}
	}
	
	;if the last line isn't a number, then add 0 to the end (refers to the first directory of the arborescence)
	lastPath := pathToFollow[pathToFollow.MaxIndex()]
	
	If lastPath is not digit
	{
		DebugPrint("getPathToRemember", "last line of path wasn't a number! '" . pathToFollow[pathToFollow.MaxIndex()] . "' added " . i - 1 . " to the path.", false)
		pathToFollow.Push(i - 1) 	;since the path starts at the first folder
	} else 
		DebugPrint("getPathToRemember", "last line is a number : '" . pathToFollow[pathToFollow.MaxIndex()] . "'", true)
	
	
	;checking path length
	If (Mod(pathToFollow.Length(), 2) != 0) {
		DebugPrint("getPathToRemember", "the path has an incorrect length : " . pathToFollow.Length(), false)
		MsgBox, , ArboScraper, the path has an incorrect length!, 3
	}
	
	/*
		disp_pathtoFollow := ""
		i := 1
		while(i < pathToFollow.MaxIndex()) {
			disp_pathtoFollow := "" . disp_pathtoFollow . "`n" . pathToFollow[i]
			i++
		}
		
		Clipboard := disp_pathtoFollow
		MsgBox, , ArboScraper, %disp_pathtoFollow%, 2
	*/
	
	return pathToFollow
}


countIndents(str) {
	i := -1
	pos := 1
	while (true) {
		i += 1
		pos := InStr(str, "    ", false, pos) + 4
		
		If (pos <= 4) 
			Break	;InStr returned 0
	}
	return i
}


ReadThroughThePath(path) {
	;parcourt le 'path' pour retourner à l'endroit où on s'est arrêté
	
	Sleep 500
	
	y := arboY + 5 
	
	MouseMove, arboX + 3, y + 10
	
	Sleep 500
	
	i := path.MaxIndex()
	Loop {
		
		If (pauseState) {
			;on pause le script
			PauseScript()
		}
		
		;move to next file
		Loop, % path[i] {
			; move n times and scroll if needed
			If (y - arboY > (arboFinY - arboY) * 0.9) {
				;need to scroll
				If (!ScrollDown()) {
					DebugPrint("ReadThroughThePath", "no more scrolling possible", true)
				} else {
					MouseMove, 0, - lineHeight * 3, 0, R
					y -= lineHeight * 3
				}
			}
			
			y := PreciseLine(y + lineHeight, 5)
			
			MouseMove, arboX, y, 0
			
			Sleep 50	;unuseful?????
		}
		
		;inspect the folder before continuing
		isFolder := IsFolderAt(y, x, 5) 	;also updates the pos of x
		
		MouseMove, x + 3, y + 10, 0
		folderName := GetName(5, isFolder)
		
		If (path[i -1] != folderName) {
			DebugPrint("ReadThroughThePath", "'" folderName "' isn't the wanted '" path[i -1] "' cannot continue!", false)
			MsgBox, , ArboScraper, % "ERROR : '" folderName "' isn't the wanted '" path[i -1] "' cannot continue!"
			Stop()
		}
		
		If !(isFolder) {
			DebugPrint("ReadThroughThePath", "'" folderName "' isn't a folder name! Expected : " path[i -1], false)
			MsgBox, , ArboScraper, % "ERROR : '" folderName "' isn't a folder name! Expected : " path[i -1]
			Stop()
		}
		
		MouseMove, -16, 0, 0, R
		Sleep 50
		
		Click	;click on the folder arrow
		
		WaitFolderLoad(y)
		
		MouseMove, arboX, y, 0
		
		;change to the next sub-folder
		i -= 2
		If (i <= 0)
			Break
	}
	
	DebugPrint("ReadThroughThePath", "finished", true)
	
	;MsgBox, , ArboScraper, % "Done resuming the scraping at " path[1], 1
	return y
}


WriteThePath(path, name:="path.txt") {
	;saves the path to a file, for debug purposes
	
	pathFile := FileOpen(name, "w")
	
	If !IsObject(pathFile) {
		MsgBox, , Can't open pathFile !
		ExitApp
	}
	
	for i, thing in path {
		pathFile.WriteLine("" . thing)
	}
	
	pathFile.close()
	
	DebugPrint("WriteThePath", "sucessfully written the path to " . name, true)
}


ReadThePath(nameOfPathFile) {
	;returns the path contained by 'nameOfPathFile'
	
	pathFile := FileOpen(nameOfPathFile, "r")
	
	path := Object()
	
	If !IsObject(pathFile) {
		MsgBox, , Can't open %nameOfPathFile% !
		ExitApp
	}
	
	while (!pathFile.AtEOF()) {
		path.Push(pathFile.ReadLine())
	}
	
	pathFile.close()
	
	;cleaning the path
	toRemove := Object()
	for i, thing in path {
		If (thing == "") {
			toRemove.Push(A_Index)
		}
		;removes all new line characters
		path[i] := StrReplace(thing, "`n")
		path[i] := StrReplace(path[i], "`r")
	}
	
	for i, thing in toRemove {
		DebugPrint("ReadThePath", "removed item n°" . i . " in path", true)
		path.RemoveAt(thing)
	}
	
	;checking if path is valid
	shouldBeAStr := false
	for i, thing in path {
		shouldBeAStr := !shouldBeAStr
		If (shouldBeAStr) {
			if thing is digit
			{
				DebugPrint("ReadThePath", "the path read from " . nameOfPathFile . " is wrong because of " . thing . " isn't a string.", false)
				MsgBox, , ArboScraper, % "ERROR_ReadThePath:the path read from " . nameOfPathFile . " is wrong because of " . thing . " isn't a string."
				Stop()
			}
		} else {
			if thing is not digit
			{
				DebugPrint("ReadThePath", "the path read from " . nameOfPathFile . " is wrong because of " . thing . " isn't a number.", false)
				MsgBox, , ArboScraper, % "ERROR_ReadThePath:the path read from " . nameOfPathFile . " is wrong because of " . thing . " isn't a number."
				Stop()
			} 
		}
	}
	
	If (Mod(path.Length(), 2) != 0) {
		;path isn't even.
		DebugPrint("ReadThePath", "the path is uneven!", false)
		MsgBox, , ArboScraper, ERROR_ReadThePath: the path is uneven!
		Stop()
	}
	
	;everything is fine
	DebugPrint("ReadThePath", "the path in " . nameOfPathFile . " is valid! Success!", true)
	
	return path
}



TestADEcrash() {
	;si le scrolling d'ADE a crashé, alors il n'y a plus que du blanc à la place de la liste
	;dans ce cas on redémarre ADE et on supprime toutes les lignes de fichier jusqu'au dernier dossier,
	;pour repartir à partir de celui-ci
	
	Sleep 500
	
	ImageSearch, , , arboX, arboY, arboFinX, arboFinY, Images\testADEcrash.png
	If (ErrorLevel == 2) {
		MsgBox, , ArboScraper, Unable to search for testADEcrash.png!
		Stop()
	} else if (ErrorLevel == 1) {
		return false ;ADE n'a pas crash
	}
	
	DebugPrint("TestADEcrash", "ADE crashed! Deleting lines until last folder...", false)
	
	out.close()
	
	outTF := TF(P_out, "outTF")	;on overwrite out directement
	
	lastLine := ""
	RIndex := 1
	Loop {
		RIndex++
		lastLine := TF_Tail(outTF, - RIndex, 1)
		
		If (!(InStr(lastLine, "ERROR_") or InStr(lastLine, "INFO_") or InStr(lastLine, " __"))) {
			;c'est un dossier, on supprime toutes les lignes après
			outTF := TF_RemoveLines(outTF, - RIndex)
			outTF := TF_InsertSuffix(outTF, -1, , "`n")
			Break
		}
	}
	
	TF_Save(outTF, "outCrash.txt", 1)
	
	outTF :=
	
	out := FileOpen("outCrash.txt", "a")	; on ouvre le fichier out que l'on vient de modifier
	
	If !IsObject(out) {
		MsgBox, , % "Cannot append to outCrash.txt !"
		ExitApp
	}
	
	DebugPrint("TestADEcrash", "outCrash.txt have been created!", true)
	
	Sleep 1000
	
	path := getPathToRemember("outCrash.txt")
	
	WriteThePath(path, "pathCrash.txt")
	
	Sleep 1000
	
	DebugPrint("TestADEcrash", "pathCrash.txt written!", true)
	
	Sleep 1000
	
	WinKill, ADE - Default, , 5, Developer Tools
	
	Sleep 1000
	
	IfWinExist, ADE - Default, , Developer Tools
	{
		SendInput, {Enter}
		Sleep 1000
	}
	
	IfWinExist, ADE - Default, , Developer Tools
	{
		WinKill
		Sleep 2000
	}
	
	IfWinExist, ADE - Default, , Developer Tools
	{
		MsgBox, , ArboScraper, Cannot close ADE!
		Stop()
	}
	
	params := ""
	If (P_path != "")
		params := "--path " . P_path
	If (P_out != "")
		params := params . " --out " . P_out
	If (P_debug)
		params := params . " --debug"
	
	params := params . " --startup --append"
	
	DebugPrint("TestADEcrash", "Script will be restarted with the following parameters: " . params, true)
	
	out.close()
	
	Sleep 500
	
	Run,"%A_AhkPath%" /restart "%A_ScriptFullPath%" %params%
}



StartAtPath(ByRef pathLength) {
	;fait commencer le script où le fichier path de 'P_path' nous mène	
	path := ReadThePath(P_path)
	
	ControlFocus, , %WIN_ADE%, , %WIN_DEV%
	
	pathLength := Floor(path.Length() / 2)
	
	return ReadThroughThePath(path)
}



InitPathVars() {
	
	; sélection du dossier 'Étudiants' pour pouvoir accéder à la fenêtre d'exportation
	y := GetFirstLine(5)
	x := arboX
	
	MouseMove, x + lineWidth * 5, y + 5
	Click
	Sleep 250
	
	ImageSearch, exportButtonX, exportButtonY, arboX, arboFinY, arboX + 200, arboFinY + 150, Images\exportButton.png
	If (ErrorLevel == 2) {
		DebugPrint("InitPathVars", "Could not search for exportButton.png", false)
		Stop()
	} else if (ErrorLevel == 1) {
		DebugPrint("InitPathVars", "Unable to find exportButton.png!", false)
		DebugImageSearch(arboX, arboFinY, arboX + 200, arboFinY + 150)
		Stop()
	}
	
	; on met la cible sur le center du bouton 
	exportButtonX += 5
	exportButtonY += 5
	
	; on ouvre la fenêtre d'exportation
	isFileNotSelected := OpenExportWindow()
	If (isFileNotSelected) {
		; on resélectionne un dossier
		Sleep 50
		MouseMove, x + lineWidth * 4, y + 20
		Click
		Sleep 250
		If (OpenExportWindow()) {
			DebugPrint("InitPathVars", "Unable to open export window.", false)
			Stop()
		}
	}
	
	; position des boutons pour choisir la date, le 2ème est sur le même Y que le 1er
	ImageSearch, dateChoiceX1, dateChoiceY, arboX + lineWidth * 6, arboY, arboFinX, arboY + lineHeight * 6, Images\calendrierDate.png
	If (ErrorLevel == 2) {
		DebugPrint("InitPathVars", "Could not search for calendrierDate.png", false)
		Stop()
	} else if (ErrorLevel == 1) {
		DebugPrint("InitPathVars", "Unable to find calendrierDate.png!", false)
		Stop()
	}
	
	; on met la cible sur le center du bouton 
	dateChoiceX1 += 2
	dateChoiceY += 2
	
	ImageSearch, dateChoiceX2, , dateChoiceX1 + 30, dateChoiceY - 10, dateChoiceX1 + 300, dateChoiceY + 40, Images\calendrierDate.png
	If (ErrorLevel == 2) {
		DebugPrint("InitPathVars", "Could not search for calendrierDate.png (2)", false)
		Stop()
	} else if (ErrorLevel == 1) {
		DebugPrint("InitPathVars", "Unable to find calendrierDate.png! (2)", false)
		Stop()
	}
	
	dateChoiceX2 += 2
	
	; pour confirmer l'export, on regarde d'abord la couleur du bouton pour savoir si il est cliquable, et donc si il y a des events dans le fichier
	ImageSearch, okButtonX, okButtonY, arboX + 200, dateChoiceY + 150, dateChoiceX2, dateChoiceY + 300, Images\exportOkButtonOn.png
	If (ErrorLevel == 2) {
		DebugPrint("InitPathVars", "Could not search for exportOkButtonOn.png", false)
		Stop()
	} else if (ErrorLevel == 1) {
		; le bouton est peut-être off
		ImageSearch, okButtonX, okButtonY, arboX + 200, dateChoiceY + 150, dateChoiceX2, dateChoiceY + 300, Images\exportOkButtonOff.png
		If (ErrorLevel == 2) {
			DebugPrint("InitPathVars", "Could not search for exportOkButtonOff.png", false)
			Stop()
		} else if (ErrorLevel == 1) {
			DebugPrint("InitPathVars", "Unable to find exportOkButtonOff.png!", false)
			Stop()
		}
	}
	
	; on met la cible à l'écart de texte 'Ok' du bouton pour pouvoir déterminer facilement sa couleur
	okButtonX -= 5
	okButtonY -= 3
	
	; sortie de la boîte de dialogue
	Sleep 50
	SendInput, {Escape} ; la raison pour utiliser le '#UseHook, On' au début, sinon le script s'arrête tout seul
	Sleep 500
}



Main_Path() {
	
	ControlFocus, , %WIN_ADE%, , %WIN_DEV%
	
	MouseMove, -5, -50, 0, R
	
	Sleep 500
	
	ReadPathForEdT()
}


ReadPathForEdT() {
	
	path := Object()
	
	while (!pathFile.AtEOF()) {
		path.Push(pathFile.ReadLine())
	}
	
	pathFile.close()
	
	;cleaning the path
	toRemove := Object()
	for i, thing in path {
		If (thing == "") {
			toRemove.Push(A_Index)
		}
		;removes all new line characters
		path[i] := StrReplace(thing, "`n")
		path[i] := StrReplace(path[i], "`r")
	}
	
	for i, thing in toRemove {
		DebugPrint("ReadPathForEdT", "removed item n°" . i . " in path", true)
		path.RemoveAt(thing)
	}
	
	
	y := GetFirstLine(5)
	x := arboX
	
	MouseMove, x + 3, y + 10
	
	pathEnum := path._NewEnum()
	While pathEnum[order_number, order] {
		Sleep, 250
		
		If (pauseState) {
			;on pause le script
			PauseScript()
		}
		
		DebugPrint("ReadPathForEdT", order, true)
		
		if order is digit
		{
			;'order' est un incrément, on doit se déplacer d'un certain nombre de lignes 
			
			Loop, % order {
				; move n times and scroll if needed
				If (y - arboY > (arboFinY - arboY) * 0.9) {
					;need to scroll
					If (!ScrollDown()) {
						DebugPrint("ReadThroughThePath", "no more scrolling possible", true)
					} else {
						MouseMove, 0, - lineHeight * 3, 0, R
						y -= lineHeight * 3
					}
				}
				
				y := PreciseLine(y + lineHeight, 5)
				
				MouseMove, arboX, y, 0
				
				Sleep, 50
			}
			
			; on traite la nouvelle ligne : on ouvre le dossier où on exporte l'emploi du temps (si c'est un fichier)
			
			isFolder := IsFolderAt(y, x, 5) ; mise à jour de x
			
			MouseMove, x + 3, y + 10, 0
			
			; vérification que c'est le bon nom
			name := GetName(5, isFolder)
			
			pathEnum.Next(order_number, order) ; la ligne suivante est le nom du dossier ou un ordre
			
			If (order == "GET_EDT") {
				; on doit exporter le fichier sous le curseur
				; on vérifie d'abord que c'est bien le bon fichier
				
				pathEnum.Next(order_number, order) ; la ligne suivante est le nom du fichier
				
				If (name != order) {
					DebugPrint("ReadThroughThePath", "edt file name '" . order . "' doesn't match the found name: '" . name . "'", false)
					Stop()
				}
				
				; exportation
				ifEmptyEdT := ExportEdT()
				
				If (ifEmptyEdT) {
					DebugPrint("ReadThroughThePath", "L'emploi du temps à " . name . " est vide.", false)
					CreateEmptyEdT(order_number)
					Sleep 1000
					Break
				}
				
				; on attend que la petite fenêtre de télécharments de chrome apparaisse pour la fermer
				CloseDownloadBar()
				
				; transfert du fichier downloadé dans le dossier EDT_OUT + renommage
				If !(FileExist(DownLoads_Folder . "\ADECal.ics")) {
					; erreur, le fichier n'a pas été téléchargé
					DebugPrint("ReadThroughThePath", "L'EdT " . name . " n'a pas pu être téléchargé", false)
					Stop()
				}
				; on overwrite n'importe quel fichier ayant le même nom
				FileMove, %DownLoads_Folder%\ADECal.ics, %EdT_Out_Folder%\%order_number%.ics, 1
				
				DebugPrint("ReadThroughThePath", "DL OK pour le fichier n°" . order_number . " soit " . name, true)
				
			} else if (order == name) {
				; c'est un dossier que l'on doit ouvrir
				
				; click sur la	 flèche
				MouseMove, -16, 0, 0, R
				Sleep 50
				Click
				
				; on attend que le dossier s'ouvre
				If (!WaitFolderLoad(y)) {
					DebugPrint("ReadThroughThePath", "ERROR: unable to open folder " . name, false)
					Stop()
				}
				
				If (y - arboY > (arboFinY - arboY) * 0.9) {
					;si on a un dossier sur la dernière ligne, quand on va l'ouvrir le prochain scroll sera foiré
					ImageSearch, , , arboX, y + lineHeight, arboX + 5, y + lineHeight + 3, Images\ADEblue.png
					If (ErrorLevel == 2) {
						DebugPrint("ReadThroughThePath", "ERROR : Unable to search ADEblue.png", false)
						Stop()
					} else if (ErrorLevel == 0) {
						DebugPrint("Main_Arbo", "On a un dossier en fin de liste", true)
						siDossierEnFinDeLigne := true
					}
				}
				
				; reset de la pos du curseur pour la prochaine ligne
				MouseMove, arboX, y, 0
				
			} else {
				; il y a une erreur
				DebugPrint("ReadThroughThePath", "folder name '" . order . "' doesn't match the found name: '" . name . "'", false)
				Stop()
			}
			
		} else if (order == "UP") {
			; on doit remonter d'un ou plusieurs crans dans l'arborescence
			; on utilise le fait que appyer sur la flèche directionnelle gauche 2 fois ferme le dossier dans lequel un élément est séléctionné
			Sleep 50
			MouseMove, arboFinX + 10, arboY - 10
			Sleep 50
			
			PixelGetColor, color, arboFinX + 9, arboY - 11, RGB
			If (color < 0xEB0000 and color != 0xFFFFFF) {
				; la case est sélectionnée car nous sommes trop haut dans l'arborescence, cela veut aussi dire que l'on peut sélectionner l'arborescence en cliquannt sur la ligne qui est certainement visible
				PixelSearch, , y, arboFinX - 50, arboY, arboFinX - 49, arboFinY, 0xFEDFB7, , Fast RGB
				If (y) {
					MouseMove, arboFinX - 50, y
					Sleep 25
					Click ; resélection de la ligne déjà sélectionnée pour s'assurer du focus de l'arborescence
					
				} else {
					; la case n'est pas visible: impossible?
					DebugPrint("ReadPathForEdT", "Couldn't find selected line at top of arborescence.", false)
					Stop()
				}
				
			} else {
				Click ; il se peut que la partie arborescence d'ADE n'ait pas le focus, en cliquant dans le coin en haut à droite on a le focus sans sélectionner de ligne
			}
			
			Sleep 500
			SendInput, {Left} ; sélection du dossier parent
			WaitForADE()
			SendInput, {Left} ; fermeture du dossier parent
			WaitForADE()
			
			; on met à jour la position du curseur : le dossier parent est maintenant séléctionné, on cherche donc une ligne sélectionnée
			; de plus le dossier sélectionné n'est peut-être pas visible, donc on scroll en haut jusqu'a trouver la ligne souhaitée
			PROTEC := 0
			while (true) {
				; on a trouvé la ligne
				PixelSearch, , y, arboFinX - 50, arboY, arboFinX - 49, arboFinY, 0xFEDFB7, , Fast RGB
				If (y) {
					y := PreciseLine(y - 12, 5) ; -12 car la zone de cette couleur s'étend sur 24 pixels 
					Break
				}
				
				; on scroll vers le haut, le dossier est peut-être plus haut
				If !(ScrollUp()) {
					; on ne peut plus remonter l'arborescence, on n'a donc pas réussi à trouver le dossier sélectionné
					DebugPrint("ReadThroughThePath", "Unable to find selected folder: start of arborescence reached.", false)
					Stop()
				}
				Sleep 25
				ScrollUp() ; encore une fois, pour le swagg et pour accélérer le processus; mais surtout pour le swagg
				Sleep 25
				
				PROTEC++
				If (PROTEC > 50) {
					DebugPrint("ReadPathForEdT", "Failed to find the selected line!", false)
					Stop()
				}
			}
			
			x := arboFinX - 50
			
			isFolder := IsFolderAt(y, x, 5) ; mise à jour de x
			If !(isFolder) {
				DebugPrint("ReadThroughThePath", "Failed to UP: new selection is not a folder", false)
				Stop()
			}
			
			DebugPrint("ReadThroughThePath", "Successfully UPped.", true)
			
		} else if (order == "RESTART") {
			DebugPrint("ReadThroughThePath", "'" . order . "' is RESTART", true)
		} else {
			; ERREUR
			DebugPrint("ReadThroughThePath", "ERROR: Order doesn't match anything: '" . order . "' at pos " . order_number . " in path " . P_path, false)
			Stop()
		}
	}
	
	DebugPrint("ReadThroughThePath", "Successfully reached the end of the path.", true)
}


ExportEdT() {
	MouseMove, 30, 0, 0, R
	Sleep 25
	Click			; sélection du fichier
	Sleep 100
	WaitForADE()
	
	isFileNotSelected := OpenExportWindow()
	If (isFileNotSelected) {
		; on resélectionne un dossier
		Sleep 500
		MouseMove, 30, 0, 0, R
		Click
		Sleep 250
		If (OpenExportWindow()) {
			DebugPrint("ExportEdT", "Unable to open export window.", false)
			Stop()
		}
		MouseMove, -30, 0, 0, R
	}
	
	; choix de la date
	MouseMove, dateChoiceX1, dateChoiceY
	Sleep 25
	Click
	Sleep 250
	; l'export doit couvrir une année, 6 mois avant et 6 mois après aujourd'hui
	SendInput, ^{Left 6} ; 6 mois avant
	MouseMove, -70, 70, 4, R ; le 1er jour de la liste
	Sleep 250
	Click
	Sleep 50
	MouseMove, dateChoiceX2, dateChoiceY
	Sleep 25
	Click
	Sleep 250
	SendInput, ^{Right 6} ; 6 mois après
	MouseMove, -70, 70, 4, R
	Sleep 250
	Click
	Sleep 500
	
	; on regarde si le bouton Ok n'est pas grisé, car si il l'est alors cet EdT est vide et il faut en créer un factice
	pixelGetColor, okColor, okButtonX, okButtonY, RGB
	If (okColor != 0xF3F3F3) {
		; tout va mal
		
		SendInput, {Escape} ; on ferme la boîte de dialogue
		
		return true
	}
	
	; confirmation de l'export
	MouseMove, okButtonX, okButtonY
	Sleep 250
	Click
	Sleep 250
	
	return false
}

CloseDownloadBar(errNb := 5) {
	PROTEC := 0
	while (true) {
		ImageSearch, dlCroixX, dlCroixY, ADE_Width - 100, ADE_Height - 100, ADE_Width, ADE_Height, Images\downloadCross.png
		If (ErrorLevel == 2) {
			DebugPrint("ReadThroughThePath", "Couldn't search for devToolsConsoleCross.png!", false)
			Stop()
		} else if (ErrorLevel == 1) {
			; la croix n'est pas encore apparue
			Sleep 50
		} else {
			; elle est LÀ!
			MouseMove, dlCroixX + 3, dlCroixY + 3, 4
			Sleep 500
			Click
			Sleep 500
			Break
		}
		
		PROTEC++
		If (PROTEC > 200) { ; 10 sec
			DebugPrint("ReadThroughThePath", "Timeout sur l'attente de la confirmation du dl de l'emploi du temps", false)
			Stop()
		}
	}
	
	; on vérifie que la barre est bien fermée, quelque fois cela rate
	PixelSearch, found, , ADE_Width - 30, ADE_Height - 10, ADE_Width - 10, ADE_Height, 0xF2F2F2, 0, Fast RGB
	If (found) {
		; échec de la fermeture de la barre
		If (errNb > 0) {
			DebugPrint("CloseDownloadBar", "Failed to close the download bar, try n°" . errNb . ", missed found cross at " . dlCroixX . " - " . dlCroixY, false)
			CloseDownloadBar(errNb -1)
			return
		} else {
			DebugPrint("CloseDownloadBar", "Failed to close the download bar", false)
			Stop()
		}
	}
	
	Sleep 1500
}



CreateEmptyEdT(name) {
	emptyEdT := FileOpen(name . ".ics", "w")
	
	If !IsObject(emptyEdT) {
		DebugPrint("CreateEmptyEdT", "Failed to create a new empty EdT named '" . name . ".ics'", false)
		Stop()
	}
	
	emptyEdT.Write("YesThisIsEmptyEdT")
	emptyEdT.Close()
	
	DebugPrint("CreateEmptyEdT", "Created empty EdT file for " . name, true)
}


ScrollUp() {
	; même chose que pour ScrollDown
	
	ImageSearch, , , arboFinX, arboY, arboFinX + 20, arboY + 20, Images\scrollHautOn.png
	If (ErrorLevel == 2) {
		DebugPrint("ScrollUp", "Unable to search for scrollHautOn.png", false)
		Stop()
	} else if (ErrorLevel == 1) {
		;on cherche si on ne trouve pas la couleur de la flèche du scroll, pour être sûr
		PixelSearch, , , arboFinX - 10, arboY - 10, arboFinX + 30, arboY + 30, 0x505050, , Fast RGB
		If (ErrorLevel == 2) {
			DebugPrint("ScrollUp", "Could not search for pixels!", false)
			Stop()
		} else if (ErrorLevel == 1) {
			return false
		}
	}
	
	; on peut scroller
	SendInput, {WheelUp}
	return true
}


OpenExportWindow(errNb := 5) {
	; on ouvre la fenêtre d'exportation
	MouseMove, exportButtonX, exportButtonY, 8
	Sleep 250
	WaitForADE()
	Click
	Sleep 500
	
	ImageSearch, , , arboX, arboY, arboX + 400, arboY + 50, Images\exportTitle.png
	If (ErrorLevel == 2) {
		DebugPrint("OpenExportWindow", "Couldn't search for exportTitle.png params: " . arboX . " " . arboY . " " . dateChoiceX1 . " " . dateChoiceY , false)
		Stop()
	} else if (ErrorLevel == 1) {
		; on regarde si il n'y a pas une erreur à l'ouverture de la fenêtre (pas de fichier sélectionné par ex.)
		ImageSearch, , , arboX, arboY, arboFinX, arboFinY, Images\exportError.png
		If (ErrorLevel == 2) {
			DebugPrint("OpenExportWindow", "Couldn't search for exportError.png", false)
			Stop()
		} else if (ErrorLevel == 1){
			If (errNb > 0) {
				DebugPrint("OpenExportWindow", "Unable to find exportTitle.png or exportError.png, retrying... (" . errNb . ")", false)				
				; le bouton n'a peut-être pas bien compris que l'on vient de lui cliquer dessus... oui oui, ADE est buggé et mal foutu
				Sleep 250
				MouseMove, arboX, arboY, 4
				Sleep 250
				MouseMove, exportButtonX - 100, exportButtonY
				Sleep 50
				MouseMove, 100, 0, 10, R
				Sleep 100
				MouseMove, -25, 0, 10, R
				Sleep 50
				return OpenExportWindow(errNb - 1)
			} else {
				; on n'a pas réussi à ouvrir la fenêtre d'export
				DebugPrint("OpenExportWindow", "Failed to open export window!", false)
				Stop()
			}
			
		} else {
			; il n'y a pas de fichier sélectionné
			DebugPrint("OpenExportWindow", "No files are currently selected.", false)
			return true
		}
	}
	
	; tout va bien
	return false
}


WaitForADE() {
	LED_switch()
	
	PROTEC := 0
	loading := 0
	while(true) {
		ImageSearch, , , ADE_Width - 20, ADE_Height - 100, ADE_Width, ADE_Height + 5, Images\ADEwait.png
		If (ErrorLevel == 2) {
			DebugPrint("WaitForADE", "Unable to search for ADEwait.png", false)
			Stop()
		} else if (ErrorLevel == 1) {
			; le chargement est fini ?
			If (loading == 0) {
				; on attend avant d'être sûr
				loading := 1
			} else {
				; maintenant on est sûr
				Sleep 100
				LED_switch()
				return
			}
		} else {
			loading := 0
		}
		
		Sleep 100
		
		PROTEC++
		If (PROTEC > 100) { ; 10 sec
			DebugPrint("WaitForADE", "Timeout!", false)
			LED_switch()
			return ; on espère que tout ira bien
		}
	}
}



PauseScript() {
	MouseGetPos, pauseX, pauseY
	
	out.Close()
	logFile.Close()
	
	Pause on
}


FinishScript(error := false) {
	IfWinExist, %WIN_ADE%, , %WIN_DEV%
	{
		ControlFocus, , %WIN_ADE%, , %WIN_DEV%
		Sleep 50
		SendInput, !{F4}
		Sleep 500
		SendInput, {Enter}
		Sleep 250	
	}
	
	stdout := FileOpen("**", "w")
	stdout.WriteLine("END")
	stdout.Close()
	
	If (error) {
		stderr := FileOpen("***","w")
		stderr.WriteLine("ERRORS OCCURED")
		stderr.Close()
	}
	
	IfWinExist, ahk_exe cmd.exe
	{
		ControlFocus, , ahk_exe cmd.exe
		Sleep 50
		
		DllCall("AttachConsole", "UInt", -1)
		
		stdout := FileOpen("**", "w")
		
		If (error)
			stdout.WriteLine("Errors occured")
		
		stdout.WriteLine("END - " . (A_TickCount - startTime) . " ms")
		
		stdout.Close()
		
		DllCall("FreeConsole")
		
		SendInput, {Enter}
	}
}


Stop(escaped := false, error := true) {
	runTime := A_TickCount - startTime
	
	If (!P_debug)
		FinishScript(error)
	
	If (escaped)
		DebugPrint("Stop", "Escaped!", true)
	Else
		TrayTip, ArboScraper, Finished!, 1, 0x21
	
	DebugPrint("Stop", error ? "Errors occured" : "Ended without errors", true)
	DebugPrint("Stop", "run time: " . runTime . " ms", true)
	
	If IsObject(out) {
		out.Close()
	}
	If IsObject(pathFile) {
		pathFile.close()
	}
	If IsObject(logFile) {
		logFile.Close()
	}
	
	ExitApp
}


TestGuiLED() {
	Gui, Color, Lime
	Gui, -Caption +Toolwindow +AlwaysOnTop +LastFound
	y := ADE_Height - 100
	Gui, Show, W25 H25 X%ADE_Width% Y%y% NA
	WinSet, Region, 0-0 %s% E
}

LED_switch() {
	static state := true
	
	If (state) 
		Gui, Color, Red
	Else
		Gui, Color, Lime
	
	state := !state
}


DebugImageSearch(x1, y1, x2, y2) {
	;debug
	
	TrayTip, ArboScraper, % "DebugImageSearch Start with " x1 ", " y1, 1, 1 
	;Sleep, 1000
	;TrayTip
	
	Sleep 1000
	
	MouseMove, x1, y1, 5
	Sleep 500
	MouseMove, x1, y2, 5
	Sleep 500
	MouseMove, x2, y2, 5
	Sleep 500
	MouseMove, x2, y1, 5
	Sleep 500
	MouseMove, x1, y1, 5
	Sleep 500
	MouseMove, -30, 0, 0, R
	Sleep 250
}


DebugPrint(function, msg, isINFO) {
	If (isINFO) {
		logFile.WriteLine(GetTime() . "	SCRAPER 	INFO_" . function . ": " . msg)
	} else {
		logFile.WriteLine(GetTime() . "	SCRAPER 	ERROR_" . function . ": " . msg)
	}
}

GetTime() {
	return A_YYYY . "-" . A_MM . "-" . A_DD . "-" . A_Hour . ":" . A_Min . ":" . A_Sec
}



PrintHelp() {
	; envoie tout dans stdout
	
	IfWinActive, ahk_exe cmd.exe
	{
		DllCall("AttachConsole", "UInt", -1)
	}
	
	stdout := FileOpen("**", "w", "UTF-8")
	
	stdout.WriteLine("`n`n----------------------- ArboScraper HELP -----------------------")
	stdout.WriteLine("Script made by Luc Briand, who can automatically export ADE timetables or it's complete arborescence")
	stdout.WriteLine("Parameters:")
	stdout.WriteLine("	-h or -? or -help			prints this")
	stdout.WriteLine("First parameter must be one of those:")
	stdout.WriteLine("	-arbo				the script acts in 'arborescence' mode, either starting at the end of`n					the 'path' file or parsing the whole arborescence")
	stdout.WriteLine("	-path				the script acts in 'path' mode, parsing the 'path' file to get to specified`n					files and download them")
	stdout.WriteLine("Additional parameters:")
	stdout.WriteLine("	--path pathFile.txt		start the script at the end of the specified path in the path file specified`n					in 'arbo' mode, main working file in 'path' mode")
	stdout.WriteLine("	--out outFile.txt		outputs in the specified file (only useful in 'arbo' mode)")
	stdout.WriteLine("	--append			open 'outFile.txt' in append mode")
	stdout.WriteLine("	--log logFile.txt		outputs log into specified file, else default to scraper_log.txt")
	stdout.WriteLine("	--dlfolder path			to specify the absolute path to the folder where downloaded`n					files of Chrome go (only required in 'path' mode)`n					ex: C:\Users\You\Downloads")
	stdout.WriteLine("	--edtfolder EdTOut		to specify the relative path (from the script directory) to the folder where`n					EdT files are outputed (only useful in 'path' mode)")
	stdout.WriteLine("	--startup			forces the script to launch ADE")
	stdout.WriteLine("	--debug				skip the startup`n`n")
	
	stdout.close()
	
	
	IfWinActive, ahk_exe cmd.exe
	{
		DllCall("FreeConsole")
		SendInput, {Enter}
	}
	
	ExitApp
}



Pause::
pauseState := !pauseState
	;on remet le curseur là où il était si on repend
if (!pauseState) {
	ControlFocus, , ADE - Default, , Developer Tools
	Sleep, 500
	MouseMove, pauseX, pauseY, 5
	Sleep 1000
	Pause off
	
	; re-open the files
	out := FileOpen(P_out, "a")	
	logFile := FileOpen(P_log, "a")
	
	If !IsObject(out) {
		MsgBox, , % "Cannot append to " . P_out . "!"
		Stop()
	}
	If !IsObject(logFile) {
		DebugPrint("Pause", "Cannot re-open log file!", false)
		Stop()
	}
}
return

Escape::
Stop(true)
return
