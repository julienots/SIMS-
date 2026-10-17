package com.superessence.mylifeuniverse;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;

/**
 * État de la manette lu nativement, exposé au jeu sous la forme du mapping « standard »
 * de la Gamepad API : A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 View=8 Menu=9 LS=10 RS=11 croix 12..15 Guide=16.
 */
public class GamepadBridge {
    private final boolean[] buttons = new boolean[17];
    // Nombre d'appuis par bouton : un appui bref entre deux images n'est jamais perdu.
    private final int[] downs = new int[17];
    private float lx, ly, rx, ry, lt, rt, hatX, hatY;
    private String name = "";
    private long lastEvent = 0;
    private long lastDeviceCheck = 0;
    private boolean deviceConnected = false;

    private static int map(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: case KeyEvent.KEYCODE_BACK: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: case KeyEvent.KEYCODE_MENU: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            case KeyEvent.KEYCODE_BUTTON_MODE: return 16;
            case KeyEvent.KEYCODE_DPAD_CENTER: return 0;
            default: return -1;
        }
    }

    public synchronized boolean onKey(int code, boolean down, String deviceName) {
        int i = map(code);
        if (i < 0) return false;
        if (down && !buttons[i]) downs[i]++;
        buttons[i] = down;
        if (deviceName != null) name = deviceName;
        lastEvent = System.currentTimeMillis();
        return true;
    }

    private static float axis(MotionEvent e, InputDevice dev, int a) {
        if (dev == null) return e.getAxisValue(a);
        InputDevice.MotionRange r = dev.getMotionRange(a, e.getSource());
        float v = e.getAxisValue(a);
        if (r != null && Math.abs(v) < r.getFlat()) return 0;
        return v;
    }

    public synchronized void onMotion(MotionEvent e, InputDevice dev) {
        lx = axis(e, dev, MotionEvent.AXIS_X);
        ly = axis(e, dev, MotionEvent.AXIS_Y);
        rx = axis(e, dev, MotionEvent.AXIS_Z);
        ry = axis(e, dev, MotionEvent.AXIS_RZ);
        if (rx == 0 && ry == 0) { rx = axis(e, dev, MotionEvent.AXIS_RX); ry = axis(e, dev, MotionEvent.AXIS_RY); }
        lt = Math.max(axis(e, dev, MotionEvent.AXIS_LTRIGGER), axis(e, dev, MotionEvent.AXIS_BRAKE));
        rt = Math.max(axis(e, dev, MotionEvent.AXIS_RTRIGGER), axis(e, dev, MotionEvent.AXIS_GAS));
        hatX = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        hatY = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        if (dev != null) name = dev.getName();
        lastEvent = System.currentTimeMillis();
    }

    private boolean anyGamepadDevice() {
        long now = System.currentTimeMillis();
        if (now - lastDeviceCheck > 1500) {
            lastDeviceCheck = now;
            deviceConnected = false;
            for (int id : InputDevice.getDeviceIds()) {
                InputDevice d = InputDevice.getDevice(id);
                if (d == null) continue;
                int s = d.getSources();
                if ((s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
                    deviceConnected = true;
                    if (name.isEmpty()) name = d.getName();
                    break;
                }
            }
        }
        return deviceConnected;
    }

    @JavascriptInterface
    public synchronized String getState() {
        boolean connected = anyGamepadDevice() || (System.currentTimeMillis() - lastEvent < 10000 && lastEvent > 0);
        StringBuilder sb = new StringBuilder(256);
        sb.append("{\"connected\":").append(connected)
          .append(",\"name\":\"").append(name.replace("\"", "'")).append('"')
          .append(",\"lx\":").append(lx).append(",\"ly\":").append(ly)
          .append(",\"rx\":").append(rx).append(",\"ry\":").append(ry)
          .append(",\"lt\":").append(lt).append(",\"rt\":").append(rt)
          .append(",\"buttons\":[");
        for (int i = 0; i < 17; i++) {
            boolean b = buttons[i];
            if (i == 12) b = b || hatY < -0.5f;
            if (i == 13) b = b || hatY > 0.5f;
            if (i == 14) b = b || hatX < -0.5f;
            if (i == 15) b = b || hatX > 0.5f;
            if (i == 6) b = b || lt > 0.5f;
            if (i == 7) b = b || rt > 0.5f;
            if (i > 0) sb.append(',');
            sb.append(b ? 1 : 0);
        }
        sb.append("],\"downs\":[");
        for (int i = 0; i < 17; i++) { if (i > 0) sb.append(','); sb.append(downs[i]); }
        sb.append("]}");
        return sb.toString();
    }
}
