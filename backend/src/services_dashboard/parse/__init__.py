"""One module per log format. Each parser takes one line (or, for `docker inspect`, one file) and
returns a record or None; `lines.parse_text` classifies a whole file with them."""
