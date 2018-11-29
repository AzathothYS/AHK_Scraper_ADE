# coding=UTF-8

from pathlib import Path
from typing import Union, TextIO, Dict, List
from datetime import datetime
from sys import stdout, _getframe
import configparser

CONFIG_FILE = "config.txt"


class Logger:

    IS_IN_TERMINAL = stdout.isatty()

    # global dict of logger files
    _log_files: Dict[Path, List[Union[int, TextIO]]] = {}  # log_file name : [number of instances using it, text file]

    log_tag: str
    log_file_path: Path
    _log_file: TextIO

    def __init__(self, log_tag: str, log_file_path: Union[str, Path]):
        self.log_tag = log_tag
        self.log_file_path = Path(log_file_path)

        if self.log_file_path in Logger._log_files:
            Logger._log_files[self.log_file_path][0] += 1
            self._log_file = Logger._log_files[self.log_file_path][1]
        else:
            self._log_file = self.log_file_path.open(mode="a", encoding="UTF-8")
            Logger._log_files[self.log_file_path] = [1, self._log_file]

    def close(self) -> None:
        """
        Close the log file if it is not used anywhere else
        """
        if not self._log_file.closed:
            self._log_file.close()
            Logger._log_files[self.log_file_path][0] -= 1
            if Logger._log_files[self.log_file_path][0] == 0:
                del Logger._log_files[self.log_file_path]

    @staticmethod
    def get_time() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def log(self, text: str, error: bool=False) -> None:
        tag = _getframe(1).f_code.co_name
        if tag == "<module>":
            tag = "root"

        if error:
            self._log_file.write("\n{}\t- {}:\t{}:\tERROR - {}".format(self.get_time(), self.log_tag, tag, text))
        else:
            self._log_file.write("\n{}\t- {}:\t{}:\tINFO  - {}".format(self.get_time(), self.log_tag, tag, text))

        if Logger.IS_IN_TERMINAL:
            print("{} \t {} - {}".format(tag, "ERROR" if error else "INFO", text))


def load_config() -> configparser.ConfigParser:
    config = configparser.ConfigParser(interpolation=configparser.ExtendedInterpolation(), converters={'Path': Path})
    config.read(CONFIG_FILE)
    return config
