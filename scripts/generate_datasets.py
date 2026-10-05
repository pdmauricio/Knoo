import os
import csv
import numpy as np

# ==========================================
# DOCUMENTACIÓN DE PARÁMETROS Y SEMILLA
# ==========================================
SEED = 42  # Semilla fija para garantizar reproducibilidad en D2 y D3
SIZES = [100_000, 500_000, 1_000_000]
ZIPF_PARAMETER = 1.5  # Parámetro de sesgo (a > 1). 1.5 es estándar para bases de datos.
OUTPUT_DIR = "scripts/datasets"

def generate_datasets():
    # Crear carpeta de salida si no existe
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Inicializar el generador de números aleatorios con la semilla documentada
    rng = np.random.default_rng(SEED)

    for size in SIZES:
        # Formatear el nombre para que sea legible (100k, 500k, 1M)
        size_label = f"{size // 1000}k" if size < 1_000_000 else f"{size // 1_000_000}M"
        print(f"Generando datasets para tamaño: {size_label}...")

        # ---------------------------------------------------------
        # D1: Enteros secuenciales (Ideal para pruebas de inserción ordenada)
        # ---------------------------------------------------------
        d1_data = np.arange(1, size + 1)
        save_csv(d1_data, f"D1_sequential_{size_label}.csv")

        # ---------------------------------------------------------
        # D2: Enteros aleatorios reproducibles
        # (Rango 1 a N*2 para permitir una densidad razonable de valores únicos)
        # ---------------------------------------------------------
        d2_data = rng.integers(1, size * 2, size=size)
        save_csv(d2_data, f"D2_random_{size_label}.csv")

        # ---------------------------------------------------------
        # D3: Acceso sesgado tipo Zipf
        # (Genera alta frecuencia de pocos elementos y una cola larga.
        # Se limita el valor máximo al tamaño del set usando np.clip para evitar outliers extremos)
        # ---------------------------------------------------------
        zipf_raw = rng.zipf(a=ZIPF_PARAMETER, size=size)
        d3_data = np.clip(zipf_raw, 1, size)
        save_csv(d3_data, f"D3_zipf_{size_label}.csv")

def save_csv(data, filename):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["value"])  # Cabecera
        # Convertimos a listas de un solo elemento para el CSV
        writer.writerows([[val] for val in data])
    print(f"  -> Guardado: {filepath}")

if __name__ == "__main__":
    print(f"--- Iniciando generación de datasets ---")
    print(f"Semilla (Seed) configurada: {SEED}")
    generate_datasets()
    print("--- ¡Generación completada! ---")