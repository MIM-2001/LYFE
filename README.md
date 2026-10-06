# LYFE

A lightweight income and tip tracker built for servers and other tipped workers. You log each shift's cash and digital tips, and LYFE shows your totals, your real hourly rate, and which days pay best.

**No sign-up, no server, no tracking.** Your data stays in your browser on your device.

## Features

- **Saved jobs.** Save each place you work with its hourly wage, usual shift times, tip-out % of sales and a color. When you log a shift, tap the job and the wage, hours and tip-out fill in. Each job shows its own take-home, $/hr and shift count, and History can be filtered by job.
- **Fast shift logging.** Pick a job, then enter date, start/end time (hours fill in automatically, including overnight shifts), cash tips, digital tips, tip-out, sales and hourly wage.
- **Built-in adding.** Tap **+** or type `40+25+12.50` (or `3x20+5`) to total your cash table by table.
- **Live preview.** See tips after tip-out, take-home, $/hr and tip % before you save.
- **Dashboard.** Week, month, year or all-time take-home, with a cash vs. digital split, $/hr, average per shift, a comparison against the same point last period, a weekly goal and a daily or monthly tips chart.
- **Insights.** Your best and worst days of the week (per shift and per hour), tip % on sales, tip-out share, best shift, month-end projection, breakdown by job and year-to-date cash vs. digital totals.
- **History.** Shifts grouped by month with subtotals, plus a job filter and search by job, notes, weekday or date. Tap a shift to edit it. Deleting a shift can be undone.
- **Backup safety net.** **Back up now** opens your phone's share sheet so you can save the backup to iCloud Drive, Google Drive, Files or email. Home reminds you when you've never backed up, or when a week of changes hasn't been backed up. LYFE also asks the browser to exempt its data from automatic clearing.
- **Your data, portable.** JSON backup and restore, plus CSV export and import, which also works for moving data in from a spreadsheet.
- **Works offline and installs like an app.** Add it to your home screen.
- **Light and dark mode**, multiple currencies, and a choice of Sunday or Monday week start.
- **Tiny.** Plain HTML, CSS and JavaScript with zero dependencies and no build step.

## Run it

Open `index.html` in a browser, or serve the folder (needed for offline mode):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Live app

**https://lyfe-tips.netlify.app** is hosted on Netlify. `netlify.toml` holds the config (no build step; the repo root is published). To redeploy manually:

```sh
netlify deploy --prod
```

### Install on your phone

Open the live URL on your phone, then:

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Install app*

> **Back up regularly.** Data lives in your browser's storage. Clearing site data, or (on iPhone) going weeks without opening a site that isn't installed to your home screen, can erase it. Installing the app and using **Settings → Download backup** keeps it safe.

## CSV format

Exports use these columns. Imports need at least `date` (YYYY-MM-DD). Rows with the same date, job and tips as an existing shift are skipped.

```
date,job,start,end,hours,cash,digital,tip_out,sales,wage,net_tips,take_home,notes
```

## How numbers are calculated

| Term | Formula |
| --- | --- |
| Tips after tip-out | cash + digital − tip-out |
| Take-home | tips after tip-out + hours × wage |
| Per hour | take-home ÷ hours, counting only shifts with hours logged |
| Tip % | (cash + digital) ÷ sales, counting only shifts with sales logged |

## Project structure

```
index.html            App shell and shift form
styles.css            Styles (light and dark themes)
app.js                All app logic
sw.js                 Service worker for offline use
manifest.webmanifest  Install metadata
icons/                App icons
```

*Not tax advice. LYFE helps you keep a daily tip record, but check with a tax professional about reporting requirements.*
