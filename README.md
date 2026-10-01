# Expense Tracker

A mobile-first expense tracker that runs entirely in the browser and installs as an app (PWA). It also tracks vehicles the way Fuelio does: fill-ups, mileage, service costs and reminders.

Everything stays on your device. There is no account, no server and no build step: just `index.html`, `app.js` and a service worker.

## Features

### Expenses and income
- Add expenses with amount, date, merchant, category and payment method (UPI, card, cash).
- Attach a bill or receipt photo, taken with the camera or uploaded from the gallery. Photos are compressed before saving.
- **Quick Add**: type naturally, e.g. `150 lunch, 1,500 amazon, uber 230`, to add several expenses at once. Categories are picked from the text.
- **Parse SMS**: paste a bank SMS to pull out the amount.
- Record income separately from expenses.
- Recurring payments (daily, weekly or monthly). Payments missed while the app was closed are added on their due dates.
- Custom categories with emoji.

### History and analysis
- Search, filter by category, and narrow to Today, This month or All.
- A calendar view with daily spending totals.
- Charts: spending trend, income vs expense and category breakdown, over 1, 3, 6 or 12 months.
- Monthly budget per category, with progress bars.

### Vehicle tracking (Fuelio-style)
- More than one vehicle (car, bike, scooter, truck) running on petrol, diesel, CNG, LPG or electric.
- **Fill-ups**: odometer, quantity, price per unit and total (enter any two and the third is worked out), full or partial tank, "missed previous fill-up", and station.
- **Mileage** uses the full-tank method. It is measured between two full-tank fill-ups and includes every partial fill in between. A stretch with a missed fill-up is skipped.
- **Costs**: service, repair, insurance, tyres, parking, toll, wash, registration/PUC, fines.
- **Reminders** due by date and/or odometer, with optional repeats (e.g. every 5,000 km or 12 months). Overdue reminders also appear on Home.
- **Dashboards**:
  - **Overview**: odometer, distance, spend and the full log
  - **Fuel**: average, best and worst mileage, fuel price trend, fill-up averages
  - **Costs**: cost per day, month and km, and a breakdown by type
  - **Monthly** and **Yearly**: distance, fuel used, costs and mileage per period
  - **Compare**: all vehicles side by side
- Every fill-up and vehicle cost is also saved as an expense in the **Fuel** or **Vehicle** category, so budgets and analysis include it.

### Data
- **Export / Import Backup**: a JSON file with all your data, including bill photos.
- **Import from Fuelio**: choose one or more Fuelio CSV exports (`vehicle-N-sync.csv`). Fill-ups, costs and reminders are imported, and miles and gallons are converted to km and litres. Importing the same file again skips the duplicates.
- **Cloud Sync**: POSTs your data (without photos) as JSON to a URL you choose.
- Dark mode.

## Running locally

The service worker only works over HTTP, not by opening `index.html` as a file. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To install it on a phone, host the folder over HTTPS (e.g. GitHub Pages) and use the browser's **Install** or **Add to Home Screen** option.

## Importing from Fuelio

1. In Fuelio, open **Backup → CSV export** (or use the CSV files from its Dropbox/Google Drive sync).
2. Copy the `vehicle-N-sync.csv` files to your phone or computer.
3. In this app, go to **Settings → Import from Fuelio (CSV)** and choose the files.

A vehicle whose name matches one you already have is merged into it. Fuelio doesn't export a vehicle type, so the app guesses it from the name and tank size. You can change it with ✎ on the vehicle.

## How data is stored

| Data | Where |
|------|-------|
| Expenses, income, budgets, categories, recurring payments | `localStorage` (`expenseTxs`, `expenseIncome`, `expenseBudgets`, `expenseCats`, `expenseRec`) |
| Vehicles, fill-ups, vehicle costs, reminders | `localStorage` (`vehicles`, `vehicleFuel`, `vehicleCosts`, `vehicleReminders`) |
| Bill / receipt photos | IndexedDB database `expenseReceipts` |

Data lives only in the browser it was entered in. Clearing site data deletes it, so export a backup regularly.

## Project structure

```
index.html      UI layout, styles and modals
app.js          All app logic (state, rendering, vehicle stats, Fuelio import, receipts)
sw.js           Service worker that caches the app and Chart.js for offline use
manifest.json   PWA manifest
favicon.ico     Browser tab icon
icons/          App icons: icon.svg is the source; the PNGs (192, 512, 180 for iOS) are rendered from it
```

Charts use [Chart.js](https://www.chartjs.org/), loaded from jsDelivr and cached by the service worker after the first online visit.

## Releasing an update

`sw.js` serves the app's own files from its cache. After changing `app.js` or `index.html`, bump `CACHE` in `sw.js` (e.g. `expense-cache-v6` → `expense-cache-v7`) so installed copies download the new version.
