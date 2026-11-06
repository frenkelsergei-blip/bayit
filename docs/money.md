# Money

The Money page opens on the current household month. Its source panel shows the last successful sync and provides Refresh; a new bank or card payment appears only after the upstream source and household server supply it. Filters select the month, audience, transaction type and category.

Select an income or expense row to see the original full name, available transaction and charge dates, payment/source details and matching transactions from the six displayed months. History uses accessible loaded records. An unloaded month is missing history, rather than zero spending. Merchant matching is deliberately conservative. Names retain their beginning in Hebrew, English and mixed text.

Use Add to record an expense, income or savings transfer. Each record has an owner and audience. Income, spending and net savings transfers have separate totals. A withdrawal from savings reduces net transfers. Recording a transfer documents it; Bayit does not initiate a bank payment.

## Goals and alerts

Open Settings → Notifications → Money goals & alerts, or Configure on the Money summary. Adults can configure independent plans for shared and personal money:

- Overall monthly and category spending limits, with an advance-warning percentage.
- A goal for projected money remaining at month end.
- A separate goal for net transfers actually recorded into savings.
- Optional expected monthly income and alerts about growing recurring charges.

Projected remaining money includes recorded income, spending and transfers, available history, and recognized unpaid commitments. The explanation beside the estimate shows its inputs and missing information. Money left unspent is never labeled an actual savings transfer. Spending room also reserves the remaining transfer goal and desired month-end balance; the short weekly allowance does not extend beyond the current month.

Choose in-app alerts, device Push or a linked Telegram chat separately. External channels require explicit opt-in, a working connection and the member's quiet-hour settings. Weekly summaries have their own day and time. Alerts use the same server-enforced audience as Money, exclude other people's private records, suppress stale-source forecasts, and deduplicate warning stages. After signing out, session-bound Push delivery stops. Devices connected before version 1.18.0 need Push enabled again.

Goal changes and manual entries are saved only after the household server confirms them. A refused change keeps the editable draft and allows retry. Finance estimates support household planning; no real bank payment, live provider connection or delivery is implied by the fictional local demo.
