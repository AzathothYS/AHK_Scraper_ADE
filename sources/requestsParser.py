# coding=UTF-8

import os
import sys
from math import ceil
from traceback import format_exc
from pathlib import Path
from typing import List, Tuple, Union

from sources.Utils import Logger, load_config

config = load_config()

WORKING_DIR = config["Main"].getPath("WORKING_DIR")
URLS_FILE = config["Database"].getPath("URLS_LIST")
FILE_REQUESTS = config["Requests"].getPath("FILE_REQUESTS")
URL_REQUESTS = config["Requests"].getPath("URL_REQUESTS")

logger = Logger("requestsParser", "log.txt")
log = logger.log


def parse_file(file: Path):
    # search for the file ID of each request in the url file, and add the url to URLS_OUT, else add the file ID and the
    # address of the request to FILES_OUT

    urls = get_urls_list()
    urls.sort(key=lambda item: item[0])

    with file.open("r", encoding="UTF-8") as requests_file, \
            FILE_REQUESTS.open("a", encoding="UTF-8") as file_requests, \
            URL_REQUESTS.open("a", encoding="UTF-8") as url_requests:

        for line in requests_file:
            file_cid, address = line.strip().split(' ', maxsplit=1)
            file_id = file_cid[2:-2]
            if not file_id.isdigit():
                raise ValueError("Expected number but got '{}' in request file.".format(file_id))
            file_id = int(file_id)

            _, url = binary_search(urls, file_id)

            if url is None:
                url_requests.write(file_cid + ' ' + address + '\n')
            else:
                file_requests.write(file_cid + ' ' + url + ' ' + address + '\n')

    log("Successfully parsed all requests.")


def patch_urls_file(patch_path: Path):
    urls = get_urls_list()
    urls_patch = []

    # load the url requests file to get the addresses of each request
    file_addresses = {}
    with URL_REQUESTS.open("r", encoding="UTF-8") as url_requests:
        for line in url_requests:
            file_cid, address = line.strip().split(' ', maxsplit=1)
            file_addresses[file_cid] = address

    # parse the patch file, update the url list for each line
    with patch_path.open("r", encoding="UTF-8") as patch_file, \
            FILE_REQUESTS.open("a", encoding="UTF-8") as file_requests:
        for line in patch_file:
            file_cid, new_url = tuple(line.strip().split(' '))
            file_id = file_cid[2:-2]
            if not file_id.isdigit():
                raise ValueError("Expected number but got '{}' in request file.".format(file_cid))
            file_id = int(file_id)

            index, url = binary_search(urls, file_id)

            # update the list if we need to
            if url is None:
                urls_patch.append((file_id, new_url))
                url = new_url
            else:
                if urls[index][1] != new_url:
                    urls[index] = (file_id, new_url)  # append to an another list, as the url list need to remain sorted

            # put the request back to the file requests now that we have the url
            file_requests.write(file_cid + ' ' + url + ' ' + file_addresses[file_cid] + '\n')

    # update the urls file
    urls.extend(urls_patch)
    with URLS_FILE.open("w", encoding="UTF-8") as urls_file:
        def urls_generator():
            for file_id, url in urls:
                yield str(file_id) + ' ' + url
        urls_file.writelines(urls_generator())


def binary_search(urls_list: List[Tuple[int, str]], file_id: int) -> Union[Tuple[int, str], Tuple[int, None]]:
    """
    Assumes that urls_list is sorted.
    Returns (index, value) if file_id is present in urls_list,
    else (-1, None).
    """
    # interpolation of the start index (file_id can be negative)
    if len(urls_list) == 0:
        return -1, None
    index = int(abs((file_id - urls_list[0][0]) / urls_list[-1][0] * (len(urls_list) - 1)))
    tries = 0
    interval = [0, len(urls_list) - 1]
    while True:
        id_at_index = urls_list[index][0]
        if id_at_index == file_id:
            return index, urls_list[index][1]
        else:
            if interval[0] >= interval[1]:
                return -1, None
            elif id_at_index > file_id:
                interval[1] = index - 1
            else:
                interval[0] = index

        index = ceil(sum(interval) / 2)

        tries += 1
        if tries > 100:
            raise ValueError("Stuck in loop while searching for '{}' in the url list.".format(file_id))


def get_urls_list() -> List[Tuple[int, str]]:
    url_list = []

    with URLS_FILE.open("r", buffering=1000, encoding="UTF-8") as url_file:
        for line in url_file:
            file_id, url = tuple(line.strip().split(' '))
            if not file_id.isdigit():
                raise ValueError("Expected number but got '{}' in urls file.".format(file_id))
            url_list.append((int(file_id), url))

    return url_list


def parse_args():
    if len(sys.argv) != 3:
        print("Help:\n"
              "-parse <file> \tparses the request file, format: <file CID> <address>"
              "-patch <file> \tpatches the files_urls file, format: <file_ID> <url (compressed)>")
        return

    file = Path(sys.argv[2])
    if not file.exists():
        raise FileNotFoundError("The file '{}' does not exist.".format(file))

    if sys.argv[1] == "-parse":
        parse_file(file)
    elif sys.argv[1] == "-patch":
        patch_urls_file(file)
    else:
        log("Invalid parameter: " + sys.argv[1])
        raise Exception("Invalid parameter: " + sys.argv[1])


if __name__ == '__main__':
    if Path(os.getcwd()) != WORKING_DIR:
        os.chdir(WORKING_DIR)

    try:
        log("Started.")
        parse_args()
        log("Finished.")

    except Exception:
        log(format_exc() + "\nrequest parser failed!\n", error=True)
        sys.stdout.write("ERROR")
    else:
        sys.stdout.write("OK")
    finally:
        logger.close()
