# dmgbuild settings for the shareable Spotifind disk image (used by package-share.sh).
# Paths come in through dmgbuild's -D defines: app, guide, background.
import os

app = defines["app"]  # noqa: F821 (provided by dmgbuild)
guide = defines["guide"]  # noqa: F821
background = defines["background"]  # noqa: F821

format = "UDZO"
filesystem = "HFS+"
size = None  # computed from the contents

files = [app, guide]
symlinks = {"Applications": "/Applications"}

# Window: 760×480 content area, icon view, no toolbar/sidebar. Positions match macos/share/dmg-background.html.
window_rect = ((200, 140), (760, 480))
default_view = "icon-view"
show_toolbar = False
show_status_bar = False
show_sidebar = False
show_pathbar = False
show_tab_view = False
icon_size = 96
text_size = 12
arrange_by = None
icon_locations = {
    os.path.basename(app): (200, 170),
    "Applications": (470, 170),
    os.path.basename(guide): (670, 170),
}
