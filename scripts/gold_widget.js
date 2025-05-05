/* --------------------------------------------------------------
Tradegate Stock Widget for https://scriptable.app 📈 by Chrischi-
Modified for Gold (CNH/gram) using alltick.co API - v1.3.0
(Trend based on previous 1-min candle, A-Share Colors)

Script: gold-cnh-widget-v1.3.js
Version: 1.3.0 (Modified)
-------------------------------------------------------------- */

let smoothPath = 0;
const gramsPerOunce = 31.1034768; // Conversion factor

// Widget Parameter: smoothPath eg. 1 (0 = straight lines, 1 = smooth curve)
// Default: 0 (straight lines)
let defaultSmooth = 0;

if (args.widgetParameter) {
    // Only expecting smoothPath now
    smoothPath = parseInt(args.widgetParameter);
    if (isNaN(smoothPath)) { // Handle invalid input
      smoothPath = defaultSmooth;
    }
} else {
    smoothPath = defaultSmooth; // Default smooth setting if no parameter
}

const apiUrl = "https://alltick.co/quote/kline";

// --- API Request Function ---
// Added klineType parameter
async function fetchGoldData(numPoints, klineType) {
    const payload = {
        "data": {
            "code": "XAUCNH",
            "kline_type": klineType.toString(), // Use parameter for kline_type
            "kline_timestamp_end": "0", // Get latest data available
            "query_kline_num": numPoints.toString(),
            "adjust_type": "0",
            "isStock": false
        }
    };
    try {
        const req = new Request(apiUrl);
        req.method = "POST";
        req.headers = { "Content-Type": "application/json" };
        req.body = JSON.stringify(payload);
        const response = await req.loadJSON();
        // Basic validation
        if (response && response.ret === 200 && response.data && response.data.kline_list && response.data.kline_list.length > 0) {
            return response.data.kline_list;
        } else {
            console.error(`API Error or no data (kline_type: ${klineType}, num: ${numPoints}):`, response ? JSON.stringify(response) : "No response");
            return null; // Indicate failure
        }
    } catch (e) {
        console.error(`Network or parsing error (kline_type: ${klineType}, num: ${numPoints}):`, e);
        return null; // Indicate failure
    }
}

// --- Create Widget Function ---
async function createWidget() {
    // Fetch historical data (need at least 2 points for comparison, fetch more for chart)
    // Fetch 50 points using 1-minute interval
    const historyDataRaw = await fetchGoldData(50, 1);

    // Need at least 2 data points to compare current vs previous
    if (!historyDataRaw || historyDataRaw.length < 2) {
        const errorList = new ListWidget();
        let errorMsg = "无法获取足够黄金数据进行比较。";
        if (historyDataRaw && historyDataRaw.length === 1) {
            errorMsg = "仅获取到1个数据点，无法计算变化。";
             // Optionally, display the single data point without trend?
        }
        errorList.addText(errorMsg);
        console.error("Failed to fetch enough data points (need >= 2). Got:", historyDataRaw ? historyDataRaw.length : 'null');
        return errorList;
    }

    // --- Process Data ---
    // API returns newest first. Index 0 is the latest, Index 1 is the previous.
    const currentDataPoint = historyDataRaw[0];
    const previousDataPoint = historyDataRaw[1];

    // Current Price (per gram) - Use the latest available close price
    const currentPricePerOunce = parseFloat(currentDataPoint.close_price);
    const currentPricePerGram = currentPricePerOunce / gramsPerOunce;
    let attr = currentPricePerGram; // Main displayed price

    // Previous Price (per gram)
    const previousPricePerOunce = parseFloat(previousDataPoint.close_price);
    const previousPricePerGram = previousPricePerOunce / gramsPerOunce;

    // Timeline Data (per gram) for chart
    let timeline = [];
    for (let item of historyDataRaw) {
        const pricePerOunce = parseFloat(item.close_price);
        timeline.push(pricePerOunce / gramsPerOunce);
    }
    // API returns newest first, chart expects oldest first.
    timeline.reverse();

    // --- Trend Calculation (Current vs Previous Minute) ---
    let trend = '';
    let color = Color.white(); // Default color if previous price is invalid
    let change = 0;

    // Ensure previous price is valid for calculation
    if (previousPricePerGram > 0) {
        // Calculate percentage change relative to the PREVIOUS minute's price
        change = Math.round(((attr / previousPricePerGram) - 1) * 10000) / 100; // Calculate % with 2 decimal places

        let trendArrow = '';

        // COLOR SWAP: Red for Up, Green for Down (compared to previous)
        if (attr > previousPricePerGram) { // Price went UP compared to previous
            trendArrow = '↑';
            color = Color.red(); // UP is RED
            trend = `${trendArrow} +${change.toFixed(2)}%`; // Add plus sign for positive change
        } else if (attr < previousPricePerGram) { // Price went DOWN compared to previous
             trendArrow = '↓';
             color = Color.green(); // DOWN is GREEN
             trend = `${trendArrow} ${change.toFixed(2)}%`; // Negative sign is implicit
        } else { // Price is unchanged
             trendArrow = '→';
             color = Color.orange(); // FLAT/UNCHANGED is Orange
             trend = `${trendArrow} 0.00%`;
        }
    } else {
         // Handle case where previous price is zero or invalid
         trend = '-'; // Indicate unavailable trend
         color = Color.gray();
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

    let titleStack = list.addStack();
    const header = titleStack.addText("黄金 (XAU/CNH)"); // Header Text
    header.font = Font.boldSystemFont(15);
    header.textColor = Color.white();

    titleStack.addSpacer();

    if (trend) { // Only add trend if calculated
        const label_trend = titleStack.addText(trend);
        label_trend.textColor = color; // Use the determined trend color
        label_trend.font = Font.boldSystemFont(13);
        label_trend.rightAlignText();
        label_trend.minimumScaleFactor = 0.7; // Allow shrinking if needed
    }

    const subheader = list.addText("人民币 / 克"); // Subheader Text (Units)
    subheader.font = Font.mediumSystemFont(13);
    subheader.textColor = Color.gray();

    list.addSpacer(17);

    // --- Line Chart --- (Using the existing LineChart class)
    if (timeline.length > 1) { // Need at least 2 points to draw a line
        let chart = new LineChart(535, 80, timeline).configure((ctx, path) => {
            ctx.opaque = false;
            ctx.setStrokeColor(color); // Use trend color for chart line
            ctx.setLineWidth(5.5);
            ctx.addPath(path);
            ctx.strokePath(); // Use strokePath, not fillPath for a line chart
        }).getImage();
        let chartStack = list.addStack();
        let img = chartStack.addImage(chart);
        img.applyFittingContentMode();
    } else {
         list.addText("图表数据不足").textColor = Color.gray(); // Add message if no chart data
    }


    list.addSpacer(10);

    const label = list.addText(attr.toFixed(2) + ""); // Display price per gram, 2 decimal places
    label.font = Font.regularSystemFont(46);
    label.rightAlignText();
    label.minimumScaleFactor = 0.80;
    label.textColor = color; // Use trend color for price

    return list;
}


//------------------------------------------------
// LineChart Class (Copied from previous version, should be fine)
//------------------------------------------------
class LineChart {
  // LineChart by kevinkub with small modifications by me

  constructor(width, height, values) {
    this.ctx = new DrawContext()
    this.ctx.size = new Size(width, height)
    this.values = values;
  }

  _calculatePath() {
    let maxValue = Math.max(...this.values);
    let minValue = Math.min(...this.values);

     // Add slight padding to min/max to prevent touching edges, handle flat lines
    let difference = maxValue - minValue;
    if (difference < 0.1) { // Add padding if range is very small or zero
        maxValue += 0.5;
        minValue -= 0.5;
        difference = maxValue - minValue;
    } else {
        maxValue += difference * 0.05; // 5% padding top
        minValue -= difference * 0.05; // 5% padding bottom
        difference = maxValue - minValue;
    }


    let count = this.values.length;
    // Prevent division by zero if count is 1 or less
     let step = (count > 1) ? this.ctx.size.width / (count - 1) : this.ctx.size.width;

    let points = this.values.map((current, index, all) => {
      let x = step * index;
      // Scale Y: (current - minValue) / difference gives ratio (0 to 1)
      // Multiply by height and invert (subtract from height) because y=0 is top
       // Handle case where difference is zero (flat line) to avoid division by zero
      let yRatio = (difference === 0) ? 0.5 : (current - minValue) / difference;
      let y = this.ctx.size.height - (yRatio * this.ctx.size.height);
       // Clamp Y to prevent drawing outside context due to padding/rounding issues
      y = Math.max(0, Math.min(this.ctx.size.height, y));
      return new Point(x, y);
    });

    if (smoothPath == 1 && points.length > 1) return this._getSmoothPath(points); // Ensure > 1 point for smooth
    else if (points.length > 0) // Need at least 1 point for _getPath
      return this._getPath(points);
    else
      return new Path(); // Return empty path if no points
  }

  _getSmoothPath(points) {
    let path = new Path()
    path.move(points[0]);
    //path.addLine(points[0]); // Removed duplicate line

    for (var i = 0; i < points.length - 1; i++) {
      // Ensure points[i+1] exists
      if (!points[i+1]) continue;

      let xAvg = (points[i].x + points[i + 1].x) / 2;
      let yAvg = (points[i].y + points[i + 1].y) / 2;
      let avg = new Point(xAvg, yAvg);
      let cp1 = new Point((xAvg + points[i].x) / 2, points[i].y);
      let next = new Point(points[i + 1].x, points[i + 1].y);
      let cp2 = new Point((xAvg + points[i + 1].x) / 2, points[i + 1].y);
      // Using addCurve instead of QuadCurve for potentially smoother results
      path.addCurve(next, cp1, cp2); // Control points order might need adjustment depending on desired curve
    }
    return path;
  }

   _getPath(points) {
       let path = new Path()
       if (points.length === 0) return path; // Return empty path if no points

       path.move(points[0]);
       for (var i = 1; i < points.length; i++) { // Start loop from 1 since we moved to points[0]
           path.addLine(points[i]);
       }
       return path;
   }


  configure(fn) {
    // Ensure there are enough points to draw
    if (!this.values || this.values.length < 2) {
        console.log("Not enough data points for chart.");
        // Draw a placeholder message maybe?
        this.ctx.setTextAlignedCenter();
        this.ctx.setTextColor(Color.gray());
        this.ctx.setFont(Font.systemFont(10));
        this.ctx.drawTextInRect("图表数据不足", new Rect(0, this.ctx.size.height / 2 - 10, this.ctx.size.width, 20));
        return this.ctx; // Return context even if empty
    }

    let path = this._calculatePath();
    if (fn) {
      fn(this.ctx, path);
    } else {
      // Default drawing - should not be needed if configure is always called with a function
      this.ctx.addPath(path);
      this.ctx.setStrokeColor(Color.white());
      this.ctx.setLineWidth(2);
      this.ctx.strokePath();
    }
    return this.ctx; // Return the context for getImage()
  }
}
//------------------------------------------------

// --- Main Execution ---
let widget = await createWidget();

// --- Suggest next refresh time ---
const refreshIntervalMinutes = 1; // 你期望的刷新间隔（分钟）
const now = new Date();
const nextRefresh = new Date(now.getTime() + refreshIntervalMinutes * 60000); // 计算下次刷新时间

// 只有当成功创建了小组件时才设置刷新时间
if (widget instanceof ListWidget) { // 检查 widget 是否是 ListWidget 类型 (避免在错误时设置)
    widget.refreshAfterDate = nextRefresh; // 告诉系统建议的下次刷新时间
    // 调试信息，可以在 Scriptable 控制台看到
    console.log(`当前时间: ${now}`);
    console.log(`建议下次刷新时间: ${nextRefresh}`);
}


if (!config.runsInWidget) {
    // 如果 widget 创建失败，这里会报错，但上面加了检查可以稍微避免
    await widget.presentSmall();
}

// Register the widget
Script.setWidget(widget);
Script.complete();