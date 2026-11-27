// [2026-11-15 03:55 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1 (đóng góp)
/** Điểm thành viên — phần máy chủ. Mọi action / subscriber khai ở đây VÀ trong bizcity.module.json (`actions`, `events.subscribes`). */
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import customerGet from './actions/customer-get.js';
import programGet from './actions/program-get.js';
import programPut from './actions/program-put.js';
import openingImport from './actions/opening-import.js';
import redeemQuote from './actions/redeem-quote.js';
import reportGet from './actions/report-get.js';
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: điểm theo đơn cho báo cáo khách hàng (đóng góp)
import orderPoints from './actions/order-points.js';
import voucherGet from './actions/voucher-get.js';
// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: nháp / duyệt chính sách tích điểm, điều chỉnh điểm tay (đóng góp)
import adjustmentApprove from './actions/adjustment-approve.js';
import adjustmentCreate from './actions/adjustment-create.js';
import adjustmentGet from './actions/adjustment-get.js';
import adjustmentList from './actions/adjustment-list.js';
import adjustmentReject from './actions/adjustment-reject.js';
import draftApprove from './actions/draft-approve.js';
import draftCreate from './actions/draft-create.js';
import draftGet from './actions/draft-get.js';
import draftList from './actions/draft-list.js';
import draftReject from './actions/draft-reject.js';
import draftUpdate from './actions/draft-update.js';
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên (đóng góp)
import memberHistory from './actions/member-history.js';
import memberList from './actions/member-list.js';
import expireDaily from './subscribers/expire-daily.js';
import orderEarn from './subscribers/order-recorded.js';
import returnReverse from './subscribers/return-recorded.js';

export default defineModule({ manifest, actions: [programPut, programGet, customerGet, redeemQuote, voucherGet, openingImport, reportGet, orderPoints,
  draftList, draftGet, draftCreate, draftUpdate, draftApprove, draftReject, adjustmentList, adjustmentGet, adjustmentCreate, adjustmentApprove, adjustmentReject, memberList, memberHistory], subscribers: [orderEarn, returnReverse, expireDaily] });
