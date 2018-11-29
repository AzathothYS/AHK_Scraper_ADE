
from pathlib import Path

ARBO_PATH = Path("arbo_out.txt")
IDs = []

def loadFileIDs():
    with open(ARBO_PATH, "r", encoding="UTF-8") as arbo:
        for line in arbo: #type: str
            if ('\t' not in line):
                continue
            IDs.append(int(line[:line.index('\t')]))
    IDs.sort()
    print("size:", len(IDs))

def findHoles():
    holes = []
    n_prev = -7
    for i, n in enumerate(IDs):
        if (n != n_prev + 1):
            holes.append((n_prev, n, i))
        n_prev = n
    
    print("holes:", len(holes))
    print(holes)

    hole_sum = 0
    max_hole = -1
    value = 0, 0
    for start, end, i in holes:
        hole_sum += end - start - 1
        if (end - start - 1 > max_hole):
            max_hole = end - start - 1
            value = start, end, i

    print("biggest hole:", max_hole, "from", value[0], "to", value[1], "which is", value[2])
    print("hole sum:", hole_sum)

def findNumbers():
    print("max:", max(IDs))
    print("first values:", IDs[:100])

loadFileIDs()
findHoles()
findNumbers()
