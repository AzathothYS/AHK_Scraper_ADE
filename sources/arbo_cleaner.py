# coding=UTF-8

ARBO_PATH = "arbo_out.txt"
ARBO_PATH_CLEANED = "arbo_clean.txt"


def replace_url_encoded_characters():
    """
    Remplace les caractères encodés en URL (\xHH) en leur valeur non encodée
    Prends en compte aussi les '"' encodés en HTML: '\x26quot;' -> '&quot;' -> '"'
    """
    lines = []
    
    with open(ARBO_PATH, "r", encoding="UTF-8") as arbo_file:
        for line in arbo_file:
            while r'\x' in line:
                pos = line.index(r'\x')
                value = line[pos+2:pos+4]
                value = chr(int(value, base=16))  # char value to char
                if value == '&' and line.find("quot;", pos + 4, pos + 10) >= 0:
                    # replace '&quot;' to '&' '\x26quot;'
                    line = line[:pos] + '"' + line[pos + 9:]
                else:
                    line = line[:pos] + value + line[pos + 4:]
            lines.append(line)
    
    with open(ARBO_PATH_CLEANED, "w", encoding="UTF-8") as arbo_file:
        arbo_file.writelines(lines)


def count_bytes():
    max_bytes = 0
    ligne_max = 0
    ligne = 0
    nb_exces = 0
    total_byte_count = 0
    byte_count = 0
    with open(ARBO_PATH_CLEANED, "rb") as arbo_file:
        byte = arbo_file.read(1)
        while byte:
            total_byte_count += 1
            if byte == b"\n":
                if byte_count >= 127:
                    nb_exces += 1
                if byte_count > max_bytes:
                    max_bytes = byte_count
                    ligne_max = ligne
                ligne += 1
                byte_count = 0
            else:
                byte_count += 1
            byte = arbo_file.read(1)
    
    print("Moyenne de bytes par ligne:", total_byte_count / ligne)
    print("Nombre de lignes avec plus de 127 bytes:", nb_exces)
    print("Ligne avec le plus de bytes:", ligne_max, "pour", max_bytes, "bytes.")


replace_url_encoded_characters()
count_bytes()
