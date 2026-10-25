#!/usr/bin/env python3
"""Convert a PRD Markdown file to HTML that Google Drive converts into a native Google Doc.

Usage: python3 -I md_to_gdoc_html.py <input.md> <output.html>

Standard library only. Handles the subset the PRD uses: headings, paragraphs,
nested bullet and numbered lists, tables, blockquotes, fenced code blocks,
**bold**, *italic*, `code` and [text](url) links.

Mermaid blocks cannot render inside a Google Doc, so they are emitted as a
captioned monospace block. The nested-bullet walkthrough that accompanies each
diagram (see tone-and-conventions.md) carries the meaning in the Doc.
"""
import html
import re
import sys


def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<i>\1</i>", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', t)
    return t


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def convert(md):
    lines = md.splitlines()
    out = []
    i = 0
    list_stack = []  # entries: (indent, tag)

    def close_lists(to_indent=-1):
        while list_stack and list_stack[-1][0] > to_indent:
            out.append("</li></%s>" % list_stack.pop()[1])

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            close_lists()
            lang = stripped[3:].strip()
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            caption = ""
            if lang == "mermaid":
                caption = "<p><i>Flowchart (Mermaid source; render it at mermaid.live or in the Markdown copy)</i></p>"
            out.append(caption + "<pre><code>%s</code></pre>" % html.escape("\n".join(block), quote=False))
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}", lines[i + 1]):
            close_lists()
            header = split_row(line)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            t = ['<table border="1" cellpadding="4" cellspacing="0">', "<tr>"]
            t += ["<th>%s</th>" % inline(c) for c in header]
            t.append("</tr>")
            for r in rows:
                t.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in r) + "</tr>")
            t.append("</table>")
            out.append("".join(t))
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            close_lists()
            n = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (n, inline(m.group(2)), n))
            i += 1
            continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            indent = len(m.group(1).replace("\t", "    "))
            tag = "ol" if m.group(2)[0].isdigit() else "ul"
            if list_stack and indent > list_stack[-1][0]:
                out.append("<%s><li>" % tag)
                list_stack.append((indent, tag))
            elif list_stack and indent == list_stack[-1][0]:
                out.append("</li><li>")
            else:
                close_lists(indent)
                if list_stack and indent == list_stack[-1][0]:
                    out.append("</li><li>")
                else:
                    out.append("<%s><li>" % tag)
                    list_stack.append((indent, tag))
            out.append(inline(m.group(3)))
            i += 1
            continue

        if stripped.startswith(">"):
            close_lists()
            out.append("<blockquote>%s</blockquote>" % inline(stripped.lstrip("> ").strip()))
            i += 1
            continue

        if not stripped:
            close_lists()
            i += 1
            continue

        close_lists()
        out.append("<p>%s</p>" % inline(stripped))
        i += 1

    close_lists()
    return "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>\n" + "\n".join(out) + "\n</body></html>\n"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        html_out = convert(f.read())
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(html_out)
    print("wrote", sys.argv[2])
