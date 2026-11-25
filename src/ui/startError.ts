import { CameraError } from '../vision/camera';

export interface StartErrorView {
  title: string;
  message: string;
  /** null = no retry possible, only 回大厅 */
  retry: string | null;
}

export function describeStartError(err: unknown): StartErrorView {
  if (!(err instanceof CameraError)) {
    return {
      title: '识别小助手没下载好 📶',
      message: '网络有点慢，AI 识别模型还没准备好。检查一下网络，再试一次吧！',
      retry: '🔁 再试一次',
    };
  }
  switch (err.kind) {
    case 'denied':
      return {
        title: '摄像头被关掉啦 🙈',
        message:
          '要用摄像头才能隔空玩哦～请点地址栏旁的 🔒 或 ⓘ 图标，在「网站设置」里把「摄像头」改成「允许」，再点下面的按钮。',
        retry: '🔁 再试一次',
      };
    case 'unsupported':
      return {
        title: '这里打不开摄像头 😢',
        message:
          '请用 Safari 或 Chrome 打开，并确认网址是 https:// 开头的哦。在微信里可以点右上角「…」选择「在浏览器打开」。',
        retry: null,
      };
    case 'not-found':
      return {
        title: '没找到摄像头 🔍',
        message: '这台设备好像没有可用的前置摄像头，检查一下再试试吧。',
        retry: '📷 重新打开摄像头',
      };
    case 'busy':
      return {
        title: '摄像头正在忙 📵',
        message: '可能被别的 App 或网页占用了，关掉它们后再试一次。',
        retry: '📷 重新打开摄像头',
      };
    default:
      return {
        title: '画面没出来 😵',
        message: '摄像头好像睡着了，点一下把它叫醒吧！',
        retry: '📷 重新打开摄像头',
      };
  }
}
