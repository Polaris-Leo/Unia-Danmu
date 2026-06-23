import express from 'express';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function createRoomRouter() {
  const router = express.Router();

  router.get('/info', async (req, res) => {
    const roomId = req.query.roomId || process.env.ROOM_ID;
    if (!roomId) return res.status(400).json({ success: false, message: '未配置房间号' });

    try {
      const [roomRes, anchorRes] = await Promise.all([
        axios.get('https://api.live.bilibili.com/room/v1/Room/get_info', {
          params: { room_id: roomId },
          headers: { 'User-Agent': UA, 'Referer': 'https://live.bilibili.com/' },
          timeout: 8000,
        }),
        axios.get('https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room', {
          params: { roomid: roomId },
          headers: { 'User-Agent': UA, 'Referer': 'https://live.bilibili.com/' },
          timeout: 8000,
        }),
      ]);

      const room = roomRes.data.data;
      const anchor = anchorRes.data.data?.info || {};

      res.json({
        success: true,
        data: {
          roomId: room.room_id,
          title: room.title || '未知标题',
          liveStatus: room.live_status, // 0=未开播 1=直播中 2=轮播
          uid: room.uid,
          uname: anchor.uname || '',
          face: anchor.face || '',
          area: room.area_name || '',
          parentArea: room.parent_area_name || '',
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  return router;
}
