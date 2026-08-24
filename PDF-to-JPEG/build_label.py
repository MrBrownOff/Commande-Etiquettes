"""
Prépare un nouveau visuel d'étiquette pour Tri-Etiquettes :
  1) Ajoute la marge de fond perdu (bleed) + les traits de coupe autour du
     contenu final (2" x 3,25"), pour obtenir un PDF 3" x 4,25" avec les
     bonnes boîtes PDF (TrimBox/BleedBox/MediaBox), identique à la
     convention des 350 fichiers existants dans public/labels-pdf/.
  2) Génère le JPEG de secours correspondant à 300 dpi (900 x 1275 px)
     dans public/labels/, pour les références sans PDF vectoriel.

Usage:
    python build_label.py source.pdf REFERENCE

  - source.pdf : PDF d'une seule page, dans l'un des deux formats suivants
                 (détecté automatiquement) :
                   a) 144 x 234 pt (2" x 3,25") : contenu final SEUL, sans
                      marge ni traits de coupe -> le script ajoute tout.
                   b) 216 x 306 pt (3" x 4,25") : page complète, marge déjà
                      incluse -> le script vérifie/complète les boîtes PDF
                      sans toucher au contenu visuel.
  - REFERENCE  : nom de référence produit (ex. MM0842216), utilisé comme
                 nom de fichier de sortie.

Organisation des dossiers (le script doit être exécuté depuis le dossier
PDF-to-JPEG/, ou alors on lui passe les chemins en paramètres) :
    PDF-to-JPEG/
    ├── build_label.py
    ├── PDF/      <- PDF final (2" x 3,25" + marge + traits de coupe)
    └── JPEG/     <- JPEG de secours à 300 dpi (900 x 1275 px)

Une fois validés, copie le contenu de PDF/ vers public/labels-pdf/ et le
contenu de JPEG/ vers public/labels/ dans le dépôt Tri-Etiquettes.

Constantes (mesurées sur les fichiers existants du dépôt, à ne pas changer
sans revoir aussi printerExport.ts) :
    TrimBox  : 144 x 234 pt (2" x 3,25")   — taille finale de l'étiquette
    BleedBox : 180 x 270 pt (2,5" x 3,75") — marge de fond perdu (0,25" par côté)
    MediaBox : 216 x 306 pt (3" x 4,25")   — page complète, traits de coupe compris
    Marge trait de coupe -> bord de coupe : 9 pt (0,125")
    Longueur des traits de coupe          : 27 pt (0,375")
"""
import sys
import os
from io import BytesIO

from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black

# ─── Constantes (mesurées sur les fichiers existants, en points, 72pt = 1po) ───
MEDIA_W, MEDIA_H = 216.0, 306.0          # 3" x 4,25"
TRIM_W, TRIM_H = 144.0, 234.0            # 2" x 3,25"
BLEED_MARGIN = 18.0                      # 0,25" -> BleedBox = 180 x 270 pt
MEDIA_MARGIN = 36.0                      # 0,5"  -> marge jusqu'au bord de la page
TRIM_X0, TRIM_Y0 = MEDIA_MARGIN, MEDIA_MARGIN   # (36, 36)
TRIM_X1, TRIM_Y1 = TRIM_X0 + TRIM_W, TRIM_Y0 + TRIM_H  # (180, 270)

MARK_GAP = 9.0        # espace entre le trait de coupe et le bord de coupe réel
MARK_LEN = 27.0        # longueur de chaque trait de coupe
MARK_WIDTH = 1.25       # épaisseur du trait (pt)


def draw_crop_marks(c: canvas.Canvas):
    """Dessine les 8 traits de coupe (2 par coin) aux coordonnées exactes
    mesurées sur les fichiers existants du dépôt."""
    c.setStrokeColor(black)
    c.setLineWidth(MARK_WIDTH)

    x_left_out, x_left_in = TRIM_X0 - MEDIA_MARGIN + 0, TRIM_X0 - MARK_GAP
    # Traits horizontaux (haut et bas), gauche et droite
    for y in (TRIM_Y1, TRIM_Y0):  # haut, bas
        # côté gauche : du bord de la page jusqu'à 9pt du trait de coupe
        c.line(0, y, TRIM_X0 - MARK_GAP, y)
        # côté droit : de 9pt après le trait de coupe jusqu'au bord de la page
        c.line(TRIM_X1 + MARK_GAP, y, MEDIA_W, y)

    # Traits verticaux (gauche et droite), haut et bas
    for x in (TRIM_X0, TRIM_X1):  # gauche, droite
        # en haut : de 9pt au-dessus du trait de coupe jusqu'au bord de la page
        c.line(x, TRIM_Y1 + MARK_GAP, x, MEDIA_H)
        # en bas : du bord de la page jusqu'à 9pt sous le trait de coupe
        c.line(x, 0, x, TRIM_Y0 - MARK_GAP)


def _finalize_and_export(writer: PdfWriter, reference: str,
                          pdf_out_dir: str, jpg_out_dir: str, dpi: int):
    """Écrit le PDF final et son JPEG de secours. Partagé par les deux modes."""
    out_page = writer.pages[0]
    out_page.mediabox.lower_left = (0, 0)
    out_page.mediabox.upper_right = (MEDIA_W, MEDIA_H)
    out_page.cropbox.lower_left = (0, 0)
    out_page.cropbox.upper_right = (MEDIA_W, MEDIA_H)
    out_page.bleedbox.lower_left = (BLEED_MARGIN, BLEED_MARGIN)
    out_page.bleedbox.upper_right = (MEDIA_W - BLEED_MARGIN, MEDIA_H - BLEED_MARGIN)
    out_page.trimbox.lower_left = (TRIM_X0, TRIM_Y0)
    out_page.trimbox.upper_right = (TRIM_X1, TRIM_Y1)

    pdf_out_path = os.path.join(pdf_out_dir, f"{reference}.pdf")
    with open(pdf_out_path, "wb") as f:
        writer.write(f)
    print(f"PDF écrit : {pdf_out_path}")

    jpg_out_path = os.path.join(jpg_out_dir, f"{reference}.jpg")
    os.system(
        f'pdftoppm -jpeg -r {dpi} -f 1 -l 1 "{pdf_out_path}" '
        f'"{jpg_out_dir}/{reference}_tmp"'
    )
    generated = [f for f in os.listdir(jpg_out_dir) if f.startswith(f"{reference}_tmp")]
    if generated:
        os.replace(os.path.join(jpg_out_dir, generated[0]), jpg_out_path)
        print(f"JPEG écrit : {jpg_out_path}")
    else:
        print("ATTENTION : la génération du JPEG a échoué (poppler installé ?)")

    return pdf_out_path, jpg_out_path


def build_label(source_pdf_path: str, reference: str,
                 pdf_out_dir: str = "PDF",
                 jpg_out_dir: str = "JPEG",
                 dpi: int = 300, tol: float = 0.5):
    os.makedirs(pdf_out_dir, exist_ok=True)
    os.makedirs(jpg_out_dir, exist_ok=True)

    src_reader = PdfReader(source_pdf_path)
    src_page = src_reader.pages[0]
    sw = float(src_page.mediabox.width)
    sh = float(src_page.mediabox.height)

    def close(a, b):
        return abs(a - b) <= tol

    # ─── Cas A : contenu seul, sans marge (2" x 3,25") ───
    if close(sw, TRIM_W) and close(sh, TRIM_H):
        print(f"Source détectée : contenu seul, {sw/72:.3f}\" x {sh/72:.3f}\" "
              "-> ajout de la marge de fond perdu et des traits de coupe.")

        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=(MEDIA_W, MEDIA_H))
        draw_crop_marks(c)
        c.save()
        buf.seek(0)
        marks_page = PdfReader(buf).pages[0]

        writer = PdfWriter()
        writer.add_page(marks_page)
        transform = Transformation().translate(TRIM_X0, TRIM_Y0)
        writer.pages[0].merge_transformed_page(src_page, transform)

        return _finalize_and_export(writer, reference, pdf_out_dir, jpg_out_dir, dpi)

    # ─── Cas B : page complète, marge déjà incluse (3" x 4,25") ───
    if close(sw, MEDIA_W) and close(sh, MEDIA_H):
        print(f"Source détectée : page complète, {sw/72:.3f}\" x {sh/72:.3f}\" "
              "(marge déjà incluse dans le fichier).")

        writer = PdfWriter()
        writer.add_page(src_page)

        raw_trimbox = src_page.get("/TrimBox")
        expected = [TRIM_X0, TRIM_Y0, TRIM_X1, TRIM_Y1]
        if raw_trimbox is not None:
            tb_vals = [round(float(v), 2) for v in raw_trimbox]
            print(f"  TrimBox déjà définie dans le fichier : {tb_vals}")
            if all(close(a, b) for a, b in zip(tb_vals, expected)):
                print("  -> Correspond à la convention attendue (2\" x 3,25\" centrée). OK.")
            else:
                raise ValueError(
                    f"La TrimBox du fichier {tb_vals} ne correspond PAS à la convention "
                    f"attendue {expected} (en points). Je ne modifie rien automatiquement : "
                    "vérifie le fichier source, ou dis-moi si c'est volontaire pour que "
                    "j'ajuste le script."
                )
        else:
            print(
                "  ATTENTION : aucune TrimBox définie dans ce fichier. J'applique la "
                f"convention standard ({expected}), en supposant que la marge de 0,5\" "
                "est bien répartie également autour du contenu, comme les fichiers "
                "existants du dépôt. Regarde le PDF généré (dossier PDF/) pour confirmer "
                "que les traits de coupe, s'ils sont déjà dans le visuel, tombent bien à "
                "cet endroit avant de l'ajouter au dépôt."
            )

        return _finalize_and_export(writer, reference, pdf_out_dir, jpg_out_dir, dpi)

    # ─── Taille non reconnue ───
    raise ValueError(
        f"Taille non reconnue : {sw:.2f} x {sh:.2f} pt ({sw/72:.3f}\" x {sh/72:.3f}\"). "
        f"Attendu soit {TRIM_W:.0f} x {TRIM_H:.0f} pt (2\" x 3,25\", contenu seul, sans marge), "
        f"soit {MEDIA_W:.0f} x {MEDIA_H:.0f} pt (3\" x 4,25\", page complète avec marge). "
        "Corrige le fichier source avant de continuer."
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python build_label.py source.pdf REFERENCE")
        sys.exit(1)
    build_label(sys.argv[1], sys.argv[2])
