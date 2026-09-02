const { Op } = require("sequelize");
const CibilApplication = require("../../model/cibil_application");

/**
 * Record or update a CIBIL report generation transaction.
 */
const recordCibilApplication = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      mobile,
      email,
      pan,
      amount = 50.0,
      paymentId,
      paymentStatus = "success",
      creditScore,
      reportUrl,
      status = "completed",
      bureau = "Experian",
      refId,
    } = req.body;

    if (!mobile || !firstName) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "First name and mobile number are required.",
      });
    }

    const first_name = String(firstName || "").trim();
    const last_name = String(lastName || "").trim();
    const full_name = `${first_name} ${last_name}`.trim();
    const clientRefId = refId || `CBL-${Date.now()}`;
    const ip_address = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const user_agent = req.headers["user-agent"] || "";

    // Check if record exists with this ref_id
    const existing = await CibilApplication.findOne({ where: { ref_id: clientRefId } });

    let record;
    if (existing) {
      record = await existing.update({
        first_name,
        last_name,
        full_name,
        mobile: String(mobile).trim(),
        email: email ? String(email).trim() : null,
        pan: pan ? String(pan).trim().toUpperCase() : null,
        amount: Number(amount) || 50.0,
        payment_id: paymentId || existing.payment_id,
        payment_status: paymentStatus || existing.payment_status,
        credit_score: creditScore ? Number(creditScore) : existing.credit_score,
        report_url: reportUrl || existing.report_url,
        status: status || existing.status,
        bureau: bureau || existing.bureau,
        ip_address,
        user_agent,
      });
    } else {
      record = await CibilApplication.create({
        ref_id: clientRefId,
        first_name,
        last_name,
        full_name,
        mobile: String(mobile).trim(),
        email: email ? String(email).trim() : null,
        pan: pan ? String(pan).trim().toUpperCase() : null,
        amount: Number(amount) || 50.0,
        payment_id: paymentId || null,
        payment_status: paymentStatus || "success",
        credit_score: creditScore ? Number(creditScore) : null,
        report_url: reportUrl || null,
        status: status || "completed",
        bureau: bureau || "Experian",
        ip_address,
        user_agent,
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "CIBIL application recorded successfully.",
      data: record,
    });
  } catch (error) {
    console.error("Error recording CIBIL application:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to record CIBIL application.",
      error: error.message,
    });
  }
};

/**
 * Fetch all CIBIL applications with search, status filters, date range, pagination, and statistics.
 */
const getAllCibilApplications = async (req, res) => {
  try {
    const {
      search,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = req.query;

    const whereClause = {};

    // Search filter
    if (search && search.trim() !== "") {
      const q = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { full_name: { [Op.like]: q } },
        { first_name: { [Op.like]: q } },
        { last_name: { [Op.like]: q } },
        { mobile: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { pan: { [Op.like]: q } },
        { ref_id: { [Op.like]: q } },
        { payment_id: { [Op.like]: q } },
      ];
    }

    // Status filter
    if (status && status !== "all") {
      whereClause.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) {
        whereClause.created_at[Op.gte] = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        whereClause.created_at[Op.lte] = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const offset = (Number(page) - 1) * Number(limit);

    // Fetch records
    const { count, rows } = await CibilApplication.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: Number(limit),
      offset: Number(offset),
    });

    // Overview Stats
    const totalApplications = await CibilApplication.count();
    const completedCount = await CibilApplication.count({
      where: { status: { [Op.in]: ["completed", "success"] } },
    });
    const pendingCount = await CibilApplication.count({
      where: { status: "pending" },
    });
    const failedCount = await CibilApplication.count({
      where: { status: "failed" },
    });
    const totalRevenue = completedCount * 50.0;

    return res.status(200).json({
      status: 200,
      success: true,
      data: rows,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)) || 1,
      },
      stats: {
        totalApplications,
        completedCount,
        pendingCount,
        failedCount,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Error fetching CIBIL applications:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to fetch CIBIL applications.",
      error: error.message,
    });
  }
};

/**
 * Fetch a single CIBIL application by ID.
 */
const getCibilApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await CibilApplication.findByPk(id);

    if (!record) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "CIBIL application record not found.",
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      data: record,
    });
  } catch (error) {
    console.error("Error fetching CIBIL application by ID:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to fetch CIBIL application.",
      error: error.message,
    });
  }
};

/**
 * Export all CIBIL applications as CSV.
 */
const exportCibilApplications = async (req, res) => {
  try {
    const applications = await CibilApplication.findAll({
      order: [["created_at", "DESC"]],
    });

    const headers = [
      "ID",
      "Ref ID",
      "Customer Name",
      "Mobile",
      "Email",
      "PAN Card",
      "Amount (INR)",
      "Payment ID",
      "Payment Status",
      "Credit Score",
      "Bureau",
      "Status",
      "Report URL",
      "Created At",
    ];

    const csvRows = [headers.join(",")];

    applications.forEach((app) => {
      const escape = (text) => `"${String(text || "").replace(/"/g, '""')}"`;
      const row = [
        app.id,
        escape(app.ref_id),
        escape(app.full_name),
        escape(app.mobile),
        escape(app.email),
        escape(app.pan),
        app.amount,
        escape(app.payment_id),
        escape(app.payment_status),
        app.credit_score || "",
        escape(app.bureau),
        escape(app.status),
        escape(app.report_url),
        escape(new Date(app.created_at).toLocaleString("en-IN")),
      ];
      csvRows.push(row.join(","));
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=cibil_applications_${Date.now()}.csv`
    );
    return res.status(200).send(csvRows.join("\n"));
  } catch (error) {
    console.error("Error exporting CIBIL applications:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Failed to export CIBIL applications.",
      error: error.message,
    });
  }
};

module.exports = {
  recordCibilApplication,
  getAllCibilApplications,
  getCibilApplicationById,
  exportCibilApplications,
};
