package com.lumiweg.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

public class LumiAccessibilityService extends AccessibilityService {
    public static LumiAccessibilityService instance;

    @Override public void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent event) {}
    @Override public void onInterrupt() {}

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    public boolean goBack() { return performGlobalAction(GLOBAL_ACTION_BACK); }
    public boolean goHome() { return performGlobalAction(GLOBAL_ACTION_HOME); }
    public boolean openRecents() { return performGlobalAction(GLOBAL_ACTION_RECENTS); }
    public boolean openNotifications() { return performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS); }
    public boolean openQuickSettings() { return performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS); }

    private AccessibilityNodeInfo root() {
        try { return getRootInActiveWindow(); } catch (Exception e) { return null; }
    }

    private AccessibilityNodeInfo findText(AccessibilityNodeInfo node, String target) {
        if (node == null || target == null) return null;
        String q=target.trim().toLowerCase();
        CharSequence text=node.getText(), desc=node.getContentDescription();
        if ((text!=null && text.toString().toLowerCase().contains(q)) ||
            (desc!=null && desc.toString().toLowerCase().contains(q))) return node;
        for (int i=0;i<node.getChildCount();i++) {
            AccessibilityNodeInfo found=findText(node.getChild(i),target);
            if(found!=null)return found;
        }
        return null;
    }

    public boolean clickText(String target) {
        AccessibilityNodeInfo n=findText(root(),target);
        if(n==null)return false;
        try {
            if(n.isClickable())return n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            AccessibilityNodeInfo p=n.getParent();
            while(p!=null){
                if(p.isClickable())return p.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                p=p.getParent();
            }
        } catch(Exception ignored) {}
        return false;
    }

    public boolean setText(String text) {
        AccessibilityNodeInfo r=root();
        if(r==null)return false;
        AccessibilityNodeInfo n=r.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if(n==null)return false;
        try {
            android.os.Bundle b=new android.os.Bundle();
            b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,text==null?"":text);
            return n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,b);
        } catch(Exception e){ return false; }
    }

    public boolean scrollForward() {
        AccessibilityNodeInfo r=root();
        if(r==null)return false;
        return scrollNode(r,AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
    }

    public boolean scrollBackward() {
        AccessibilityNodeInfo r=root();
        if(r==null)return false;
        return scrollNode(r,AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
    }

    private boolean scrollNode(AccessibilityNodeInfo n,int action){
        if(n==null)return false;
        try{if(n.isScrollable()&&n.performAction(action))return true;}catch(Exception ignored){}
        for(int i=0;i<n.getChildCount();i++)if(scrollNode(n.getChild(i),action))return true;
        return false;
    }

    public boolean tap(float x,float y) {
        if(Build.VERSION.SDK_INT<24)return false;
        try{
            Path p=new Path();p.moveTo(x,y);
            GestureDescription g=new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(p,0,50)).build();
            return dispatchGesture(g,null,null);
        }catch(Exception e){return false;}
    }

    public String dumpUi() {
        JSONArray out=new JSONArray();
        dumpNode(root(),out,0);
        return out.toString();
    }

    private void dumpNode(AccessibilityNodeInfo n,JSONArray out,int depth){
        if(n==null||depth>10||out.length()>250)return;
        try{
            String text=n.getText()==null?"":n.getText().toString().trim();
            String desc=n.getContentDescription()==null?"":n.getContentDescription().toString().trim();
            if(!text.isEmpty()||!desc.isEmpty()||n.isClickable()||n.isScrollable()){
                JSONObject o=new JSONObject();
                o.put("text",text);o.put("description",desc);
                o.put("clickable",n.isClickable());o.put("scrollable",n.isScrollable());
                o.put("class",String.valueOf(n.getClassName()));
                out.put(o);
            }
            for(int i=0;i<n.getChildCount();i++)dumpNode(n.getChild(i),out,depth+1);
        }catch(Exception ignored){}
    }
}
