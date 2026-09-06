"""Spanish administrative constants.

Lives on its own because two stages need it and its former home,
stages/municipios.py, was superseded by stages/places.py when the search
grew past Spain. Keeping a dead stage alive just to import one dict from it
was asking for somebody to run it by accident.

INE province codes have been stable since 1833, so this is hardcoded rather
than fetched.
"""
from __future__ import annotations

# INE province code -> (province, autonomous community).
PROVINCES = {
    "01": ("Araba/Alava", "Pais Vasco"),
    "02": ("Albacete", "Castilla-La Mancha"),
    "03": ("Alicante/Alacant", "Comunitat Valenciana"),
    "04": ("Almeria", "Andalucia"),
    "05": ("Avila", "Castilla y Leon"),
    "06": ("Badajoz", "Extremadura"),
    "07": ("Illes Balears", "Illes Balears"),
    "08": ("Barcelona", "Cataluna"),
    "09": ("Burgos", "Castilla y Leon"),
    "10": ("Caceres", "Extremadura"),
    "11": ("Cadiz", "Andalucia"),
    "12": ("Castello/Castellon", "Comunitat Valenciana"),
    "13": ("Ciudad Real", "Castilla-La Mancha"),
    "14": ("Cordoba", "Andalucia"),
    "15": ("A Coruna", "Galicia"),
    "16": ("Cuenca", "Castilla-La Mancha"),
    "17": ("Girona", "Cataluna"),
    "18": ("Granada", "Andalucia"),
    "19": ("Guadalajara", "Castilla-La Mancha"),
    "20": ("Gipuzkoa", "Pais Vasco"),
    "21": ("Huelva", "Andalucia"),
    "22": ("Huesca", "Aragon"),
    "23": ("Jaen", "Andalucia"),
    "24": ("Leon", "Castilla y Leon"),
    "25": ("Lleida", "Cataluna"),
    "26": ("La Rioja", "La Rioja"),
    "27": ("Lugo", "Galicia"),
    "28": ("Madrid", "Comunidad de Madrid"),
    "29": ("Malaga", "Andalucia"),
    "30": ("Murcia", "Region de Murcia"),
    "31": ("Navarra", "Navarra"),
    "32": ("Ourense", "Galicia"),
    "33": ("Asturias", "Principado de Asturias"),
    "34": ("Palencia", "Castilla y Leon"),
    "35": ("Las Palmas", "Canarias"),
    "36": ("Pontevedra", "Galicia"),
    "37": ("Salamanca", "Castilla y Leon"),
    "38": ("Santa Cruz de Tenerife", "Canarias"),
    "39": ("Cantabria", "Cantabria"),
    "40": ("Segovia", "Castilla y Leon"),
    "41": ("Sevilla", "Andalucia"),
    "42": ("Soria", "Castilla y Leon"),
    "43": ("Tarragona", "Cataluna"),
    "44": ("Teruel", "Aragon"),
    "45": ("Toledo", "Castilla-La Mancha"),
    "46": ("Valencia/Valencia", "Comunitat Valenciana"),
    "47": ("Valladolid", "Castilla y Leon"),
    "48": ("Bizkaia", "Pais Vasco"),
    "49": ("Zamora", "Castilla y Leon"),
    "50": ("Zaragoza", "Aragon"),
    "51": ("Ceuta", "Ceuta"),
    "52": ("Melilla", "Melilla"),
}
