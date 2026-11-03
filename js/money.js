/**
 * Shared Indian-rupee money helpers for the auction app.
 * Values are stored in whole rupees. 1 Lakh = 1,00,000 | 1 Crore = 1,00,00,000
 */
function showAmount(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return "0";
    }

    const value = Number(amount);
    if (value < 0) {
        return "Error!";
    }

    if (value >= 10000000) {
        const cr = value / 10000000;
        return `${trimMoneyDecimals(cr)} Cr`;
    }
    if (value >= 100000) {
        const lakh = value / 100000;
        return `${trimMoneyDecimals(lakh)} L`;
    }
    if (value >= 1000) {
        return `${Math.floor(value / 1000)} K`;
    }
    return String(value);
}

function trimMoneyDecimals(value) {
    return value % 1 === 0 ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatMoney(amount) {
    return `Rs ${showAmount(amount)}`;
}

function parseMoneyInput(rawValue) {
    if (typeof rawValue === "number") return rawValue;
    if (!rawValue) return NaN;

    const cleaned = String(rawValue).trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
    const match = cleaned.match(/^(\d+(?:\.\d+)?)(cr|c|lakh|lacs|lac|l|k)?$/);
    if (!match) {
        return parseInt(cleaned, 10);
    }

    const number = parseFloat(match[1]);
    const unit = match[2];
    if (!unit) return Math.round(number);
    if (unit === "cr" || unit === "c") return Math.round(number * 10000000);
    if (unit === "lakh" || unit === "lacs" || unit === "lac" || unit === "l") return Math.round(number * 100000);
    if (unit === "k") return Math.round(number * 1000);
    return Math.round(number);
}
