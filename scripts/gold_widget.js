/* --------------------------------------------------------------
Gold Widget for Scriptable using alltick.co API - v1.5.1
- Fetches XAU/CNH price, converts to CNH/gram.
- Trend based on previous 1-min candle vs current.
- Uses LAST element from API response as current data.
- A-Share Colors (Red Up, Green Down).
- Displays update time (forced to Asia/Shanghai).
- Configurable Refresh Logic.
- Includes Referer, Origin, and User-Agent headers for API request.

Original Stock Widget Concept by Chrischi-
Modifications by User & AI assistant
-------------------------------------------------------------- */

// --- Configuration ---
// You can adjust these default values
const widget_config = {
    update_full_minutes: 5, // Default refresh interval (minutes) - iOS might override
    offset_minutes: 0,      // Default refresh offset (minutes)
    default_smoothPath: 0    // Default chart smoothing (0 = straight, 1 = smooth)
};

// --- Global Variables & Constants ---
let smoothPath = widget_config.default_smoothPath;
const gramsPerOunce = 31.1034768; // Conversion factor
const apiUrl = "https://alltick.co/quote/kline";

// --- Widget Parameter Processing ---
// Parameter: smoothPath eg. 1 (0 = straight lines, 1 = smooth curve)
if (args.widgetParameter) {
    smoothPath = parseInt(args.widgetParameter);
    if (isNaN(smoothPath) || (smoothPath !== 0 && smoothPath !== 1)) { // Validate input
        console.warn(`Invalid smoothPath parameter: "${args.widgetParameter}". Using default: ${widget_config.default_smoothPath}`);
        smoothPath = widget_config.default_smoothPath;
    }
}

// --- API Request Function ---
async function fetchGoldData(numPoints, klineType) {
    const payload = {
        "data": {
            "code": "XAUCNH",
            "kline_type": klineType.toString(),
            "kline_timestamp_end": "0",
            "query_kline_num": numPoints.toString(),
            "adjust_type": "0",
            "isStock": false
        }
    };
    try {
        const req = new Request(apiUrl);
        req.method = "POST";
        req.headers = {
            "Content-Type": "application/json",
            "Referer": "https://alltick.co/",
            "Origin": "https://alltick.co/",
            "User-Agent": "Mozilla/5.0"
        };
        req.body = JSON.stringify(payload);
        const response = await req.loadJSON();
        if (response && response.ret === 200 && response.data && response.data.kline_list && response.data.kline_list.length > 0) {
            return response.data.kline_list; // Returns array, likely oldest-to-newest
        } else {
            console.error(`API Error or no data (kline_type: ${klineType}, num: ${numPoints}):`, response ? JSON.stringify(response) : "No response");
            return null;
        }
    } catch (e) {
        console.error(`Network or parsing error (kline_type: ${klineType}, num: ${numPoints}):`, e);
        return null;
    }
}

// --- Create Widget Function ---
async function createWidget() {
    // Fetch historical data (need at least 2 points for comparison, fetch more for chart)
    const historyDataRaw = await fetchGoldData(50, 1); // Fetch 50 points, 1-min interval

    // Error Handling for API Data
    if (!historyDataRaw || historyDataRaw.length < 2) {
        const errorList = new ListWidget();
        let errorMsg = "无法获取足够黄金数据进行比较。";
        if (historyDataRaw && historyDataRaw.length === 1) {
            errorMsg = "仅获取到1个数据点，无法计算变化。";
        }
        errorList.addText(errorMsg);
        console.error("Failed to fetch enough data points (need >= 2). Got:", historyDataRaw ? historyDataRaw.length : 'null');
        // Optionally set background for error widget
        let errStartColor = new Color("#551111");
        let errEndColor = new Color("#330000");
        let errGradient = new LinearGradient();
        errGradient.colors = [errStartColor, errEndColor];
        errGradient.locations = [0.1, 1];
        errorList.backgroundGradient = errGradient;
        return errorList; // Return error widget early
    }

    // --- Process Data (Using LAST element as MOST RECENT) ---

    // The LAST element is the most recent (current) data point
    const currentDataPoint = historyDataRaw[historyDataRaw.length - 1];
    // The SECOND-TO-LAST element is the previous data point
    const previousDataPoint = historyDataRaw[historyDataRaw.length - 2];

    // Current Price (per gram) - Use the LATEST available close price
    const currentPricePerOunce = parseFloat(currentDataPoint.close_price);
    const currentPricePerGram = currentPricePerOunce / gramsPerOunce;
    let attr = currentPricePerGram; // Main displayed price

    // Previous Price (per gram)
    const previousPricePerOunce = parseFloat(previousDataPoint.close_price);
    const previousPricePerGram = previousPricePerOunce / gramsPerOunce;

    // Timeline Data (per gram) for chart
    // Data is assumed oldest-to-newest, directly map prices
    let timeline = historyDataRaw.map(item => {
        const pricePerOunce = parseFloat(item.close_price);
        return pricePerOunce / gramsPerOunce;
    });
    // timeline.reverse(); // NO LONGER NEEDED if API returns oldest-to-newest

    // --- Trend Calculation (Current vs Previous Minute) ---
    let trend = '';
    let color = Color.white();
    let change = 0;

    if (previousPricePerGram > 0) {
        change = Math.round(((attr / previousPricePerGram) - 1) * 10000) / 100; // % change with 2 decimals
        let trendArrow = '';
        if (attr > previousPricePerGram) {
            trendArrow = '↑'; color = Color.red(); trend = `${trendArrow} +${change.toFixed(2)}%`;
        } else if (attr < previousPricePerGram) {
            trendArrow = '↓'; color = Color.green(); trend = `${trendArrow} ${change.toFixed(2)}%`;
        } else {
            trendArrow = '→'; color = Color.orange(); trend = `${trendArrow} 0.00%`;
        }
    } else {
         trend = '-'; color = Color.gray();
         console.warn("Previous price was zero or invalid, cannot calculate trend.");
    }

    // --- Build Widget UI ---
    const list = new ListWidget();
    let startColor = new Color("#191a19");
    let endColor = new Color("#0d0d0d");
    let gradient = new LinearGradient();
    gradient.colors = [startColor, endColor];
    gradient.locations = [0.1, 1];
    list.backgroundGradient = gradient;

    list.addSpacer(3);

    // Top Row: Title and Trend
    let titleStack = list.addStack();
    const header = titleStack.addText("黄金 (XAU/CNH)");
    header.font = Font.boldSystemFont(15);
    header.textColor = Color.white();
    titleStack.addSpacer();
    if (trend) {
        const label_trend = titleStack.addText(trend);
        label_trend.textColor = color;
        label_trend.font = Font.boldSystemFont(13);
        label_trend.rightAlignText();
        label_trend.minimumScaleFactor = 0.7;
    }

    // Subtitle: Units
    const subheader = list.addText("人民币 / 克");
    subheader.font = Font.mediumSystemFont(13);
    subheader.textColor = Color.gray();

    list.addSpacer(17);

    // Chart
    if (timeline.length > 1) {
        let chart = new LineChart(535, 80, timeline).configure((ctx, path) => {
            ctx.opaque = false;
            ctx.setStrokeColor(color);
            ctx.setLineWidth(5.5);
            ctx.addPath(path);
            ctx.strokePath();
        }).getImage();
        let chartStack = list.addStack();
        let img = chartStack.addImage(chart);
        img.applyFittingContentMode();
    } else {
        list.addText("图表数据不足").textColor = Color.gray();
    }

    list.addSpacer(10); // Spacer above main price

    // Main Price Label
    const label = list.addText(attr.toFixed(2) + "");
    label.font = Font.regularSystemFont(46);
    label.rightAlignText();
    label.minimumScaleFactor = 0.80;
    label.textColor = color;

    // Update Timestamp (Uses the LAST element's timestamp, Forced to Asia/Shanghai)
    list.addSpacer(5);
    let updateTimeString = "更新时间: N/A";
    if (currentDataPoint && currentDataPoint.timestamp) {
        try {
            const timestampSeconds = parseInt(currentDataPoint.timestamp);
            if (!isNaN(timestampSeconds)) {
                 const updateDate = new Date(timestampSeconds * 1000);
                 // --- Force Formatting to Asia/Shanghai Timezone ---
                 const options = { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false };
                 const formattedTime = updateDate.toLocaleTimeString([], options);
                 updateTimeString = `更新: ${formattedTime}`;
                 // ----------------------------------------------
            } else { console.warn("Parsed timestamp is NaN:", currentDataPoint.timestamp); }
        } catch (e) { console.error("Error processing timestamp:", e); }
    } else { console.warn("Timestamp missing in currentDataPoint:", currentDataPoint); }
    let timeText = list.addText(updateTimeString);

    timeText.textColor = Color.gray();
    timeText.rightAlignText();

    return list;
}

//------------------------------------------------
// LineChart Class (Should be robust enough)
//------------------------------------------------
class LineChart {
  constructor(width, height, values) {
    this.ctx = new DrawContext();
    this.ctx.size = new Size(width, height);
    this.values = values;
  }

  _calculatePath() {
    if (!this.values || this.values.length < 1) return new Path(); // Handle empty values

    let maxValue = Math.max(...this.values);
    let minValue = Math.min(...this.values);
    let difference = maxValue - minValue;

    // Add padding, handle flat line
    if (difference < 0.1) {
        maxValue += 0.5; minValue -= 0.5; difference = maxValue - minValue;
    } else {
        maxValue += difference * 0.05; minValue -= difference * 0.05; difference = maxValue - minValue;
    }

    let count = this.values.length;
    let step = (count > 1) ? this.ctx.size.width / (count - 1) : this.ctx.size.width;

    let points = this.values.map((current, index) => {
      let x = step * index;
      let yRatio = (difference === 0) ? 0.5 : (current - minValue) / difference;
      let y = this.ctx.size.height - (yRatio * this.ctx.size.height);
      y = Math.max(0, Math.min(this.ctx.size.height, y)); // Clamp Y
      return new Point(x, y);
    });

    // Choose path type based on smoothing preference and point count
    if (smoothPath == 1 && points.length > 1) return this._getSmoothPath(points);
    else if (points.length > 0) return this._getPath(points);
    else return new Path();
  }

  _getSmoothPath(points) {
    let path = new Path();
    if (points.length === 0) return path;
    path.move(points[0]);
    for (var i = 0; i < points.length - 1; i++) {
      if (!points[i+1]) continue; // Should not happen with length > 1 check but safe
      let xAvg = (points[i].x + points[i + 1].x) / 2;
      let yAvg = (points[i].y + points[i + 1].y) / 2;
      let cp1 = new Point((xAvg + points[i].x) / 2, points[i].y);
      let next = new Point(points[i + 1].x, points[i + 1].y);
      let cp2 = new Point((xAvg + points[i + 1].x) / 2, points[i + 1].y);
      path.addCurve(next, cp1, cp2);
    }
    return path;
  }

    _getPath(points) {
        let path = new Path();
        if (points.length === 0) return path;
        path.move(points[0]);
        for (var i = 1; i < points.length; i++) {
            path.addLine(points[i]);
        }
        return path;
    }

  configure(fn) {
    if (!this.values || this.values.length < 2) {
        console.log("Not enough data points for chart drawing.");
        this.ctx.setTextAlignedCenter();
        this.ctx.setTextColor(Color.gray());
        this.ctx.setFont(Font.systemFont(10));
        this.ctx.drawTextInRect("图表数据不足", new Rect(0, this.ctx.size.height / 2 - 10, this.ctx.size.width, 20));
        return this.ctx;
    }

    let path = this._calculatePath();
    if (fn) { fn(this.ctx, path); }
    else { // Default fallback (shouldn't be used if called correctly)
        this.ctx.addPath(path); this.ctx.setStrokeColor(Color.white()); this.ctx.setLineWidth(2); this.ctx.strokePath();
    }
    return this.ctx;
  }
}
//------------------------------------------------

// --- Main Execution ---
let widget = await createWidget();



let now = new Date()
let then = new Date(now.getTime() + 5 * 60 * 1000)
let timer = widget.addDate(then)
timer.applyRelativeStyle()
widget.presentSmall()
Script.setWidget(widget)
Script.complete()