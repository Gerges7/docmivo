#!/usr/bin/env python3
"""Verify real DocMivo split-pdf.zip against original merged.pdf.
Usage: python verify_split_zip.py merged.pdf split-pdf.zip '1;2-17'
Requires: pip install pymupdf
Does not upload any content; compares renders and extracted text locally.
"""
import re
import sys
import zipfile
from io import BytesIO
import fitz


def parse_ranges(expr, pages):
    groups = []
    for group in expr.split(';'):
        if not group.strip():
            raise ValueError('Empty split group')
        indexes = []
        for piece in group.split(','):
            p = piece.strip()
            m = re.fullmatch(r'(\d+)(?:\s*-\s*(\d*))?', p)
            if not m:
                raise ValueError('Invalid page entry: ' + p)
            lo = int(m.group(1)); hi = int(m.group(2)) if m.group(2) else pages if '-' in p else lo
            if not (1 <= lo <= hi <= pages):
                raise ValueError('Out-of-range page entry: ' + p)
            indexes.extend(range(lo-1, hi))
        # Mirrors deduplication of the current browser selection helper.
        groups.append(list(dict.fromkeys(indexes)))
    return groups


def check(source_path, zip_path, expr):
    source = fitz.open(source_path)
    groups = parse_ranges(expr, len(source))
    bad = []
    with zipfile.ZipFile(zip_path) as z:
        entries = sorted(x for x in z.namelist() if not x.endswith('/'))
        expected = sorted(f'part-{i+1}.pdf' for i in range(len(groups)))
        print('ZIP entries:', entries)
        if entries != expected:
            raise AssertionError(f'Unexpected ZIP entries. Expected {expected}')
        tested = 0
        for i, indexes in enumerate(groups):
            name = f'part-{i+1}.pdf'
            result = fitz.open(stream=BytesIO(z.read(name)).getvalue(), filetype='pdf')
            print(name, 'pages:', len(result), 'expected:', len(indexes))
            if len(result) != len(indexes):
                bad.append(f'{name}: wrong number of pages')
            for k, orig_idx in enumerate(indexes[:len(result)]):
                original = source[orig_idx]; actual = result[k]
                dimensions_ok = (abs(original.rect.width-actual.rect.width)<0.1 and
                                 abs(original.rect.height-actual.rect.height)<0.1)
                text_ok = original.get_text('text') == actual.get_text('text')
                original_pix = original.get_pixmap(matrix=fitz.Matrix(1.0,1.0), alpha=False)
                actual_pix = actual.get_pixmap(matrix=fitz.Matrix(1.0,1.0), alpha=False)
                same_dimensions = (original_pix.width == actual_pix.width and
                                   original_pix.height == actual_pix.height)
                # Some PDF writers change antialiasing by 1-2 grayscale values
                # while preserving all visible content. Tolerate only this
                # very small channel-level difference; reject real changes.
                if same_dimensions:
                    a_samples, b_samples = original_pix.samples, actual_pix.samples
                    pixels_ok = (a_samples == b_samples or
                                 all(abs(x-y) <= 2 for x,y in zip(a_samples, b_samples)))
                else:
                    pixels_ok = False
                tested += 1
                if not (dimensions_ok and text_ok and pixels_ok):
                    bad.append(f'{name} page {k+1} (source page {orig_idx+1}): dimensions={dimensions_ok}, text={text_ok}, pixels={pixels_ok}')
    print('Source pages:',len(source), 'Pages checked:', tested, 'Issues:',len(bad))
    for issue in bad: print('FAIL:',issue)
    if bad:
        raise AssertionError('Split ZIP does not match the source PDF')
    print('PASS: Split outputs match the expected original pages and order')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit('Usage: python verify_split_zip.py merged.pdf split-pdf.zip "1;2-17"')
    check(*sys.argv[1:])
