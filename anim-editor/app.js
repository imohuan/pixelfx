// UI 层：Vue 3 + kit-ui-js。渲染全部交给 engine.js，这里只管组装 composable 和组件。
// 一期重构：原 1284 行拆为 src/composables/*（逻辑）+ src/components/*（模板）+ src/lib/*（纯函数）。
import * as EN from "./engine.js";
import { PickCards, PickSeg, PickSwatch, FxLibrary, WEAPON_LABELS } from "./pick-cards.js";
import { useProject, uid, clipEndOf, activeAt } from "./src/composables/useProject.js";
import { useFiles } from "./src/composables/useFiles.js";
import { usePlayback } from "./src/composables/usePlayback.js";
import { useSplits } from "./src/composables/useSplits.js";
import { useSplitsController } from "./src/composables/useSplitsController.js";
import { useResourceTab } from "./src/composables/useResourceTab.js";
import { useTimeline } from "./src/composables/useTimeline.js";
import { useSelection } from "./src/composables/useSelection.js";
import { useGizmo } from "./src/composables/useGizmo.js";
import { useCanvasView } from "./src/composables/useCanvasView.js";
import { PropsPanel } from "./src/components/PropsPanel.js";
import { CanvasStage } from "./src/components/CanvasStage.js";
import { TimelinePanel } from "./src/components/TimelinePanel.js";
import { ClipLibrary } from "./src/components/ClipLibrary.js";
import { LayerPanel } from "./src/components/LayerPanel.js";
import { useLayerRename } from "./src/composables/useLayerRename.js";
import { useHistory } from "./src/composables/useHistory.js";
import { vFocus } from "./src/directives/focus.js";
import { ROW_H, TYPE_ICON, PALETTE_OPTIONS, PAL_HEX, hexOf, typeIcon, labelOf, skinColor, actLabel, actShort } from "./src/lib/labels.js";

const {
  SKIN_NAMES, WEAPONS, SKIN_TINT, loadFx, loadedFx,
  resetView, zoomAt, screenToWorld, view,
  defaultProject, iceLanceProject, swordComboProject,
  createEngine,
} = EN;

export function mount() {
  const app = Vue.createApp({
    setup() {
      const { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;
      const notify = window.KitNotify;

      // ---- 基础 refs ----
      const time = ref(0);
      const viewScale = ref(1.6);
      const pxPerSec = ref(240);
      const tlMode = ref("frame"); // 默认「帧」模式
      const canvasEl = ref(null);
      const stageEl = ref(null);

      // ---- splits 状态 + DOM 控制器 ----
      const S = useSplits();
      const { leftW, rightW, canvasW, stageH, tlH } = S;

      // ---- 项目 ----
      const drawPendingBox = { v: 0 };
      let engine = null;
      const engineGetter = () => engine;

      function drawNow() {
        if (!engine) return;
        engine.time = time.value;
        engine.dark = darkBg.value;
        try { engine.draw(); } catch (e) { console.warn("draw", e); }
        const s = Math.round(view.scale * 100) / 100;
        if (s !== viewScale.value) viewScale.value = s;
      }
      function scheduleDraw() {
        if (drawPendingBox.v) return;
        drawPendingBox.v = requestAnimationFrame(() => { drawPendingBox.v = 0; drawNow(); });
      }

      const P = useProject(scheduleDraw, engineGetter, time);
      const { project, selectedId, selected, sortedClips, clips, trackOptions } = P;
      watch(project, scheduleDraw, { deep: true });
      // 载入工程后按“同一行禁止重叠”自动分层，保证初始数据也不重叠
      P.normalizeRows();

      // ---- 播放 ----
      function resetEngine() {
        engine?.invalidate();
        engine?.resetTargets();
      }

      // ---- 全局历史记录（撤销 / 重做）----
      const H = useHistory({ project, engineGetter, afterRestore: () => { selectedId.value = project.clips.some((c) => c.id === selectedId.value) ? selectedId.value : (project.clips[0]?.id ?? null); resetEngine(); scheduleDraw(); } });
      const { canUndo, canRedo } = H;
      H.reset(); // 建立初始基线，保证第一次撤销有可回退的起点
      watch(project, H.scheduleCommit, { deep: true });
      const PB = usePlayback({ time, project, drawNow, resetEngine });
      const { playing, setTime, advance, togglePlay, play, stop, dispose } = PB;

      // ---- 资源 tab / 选项 ----
      const R = useResourceTab(project);

      // ---- 选择编辑 ----
      const SEL = useSelection({ selected, project, time, scheduleDraw, engineGetter, setTime });

      // ---- gizmo / 画布 ----
      const G = useGizmo({ selected, selectedId, project, time, canvasEl, engineGetter, drawNow });
      const CV = useCanvasView({ canvasEl, stageEl, project, time, viewScale, engineGetter, gizmo: G });
      const { showBox, showAxes, handMode, toggleHand, toggleBox, toggleAxes } = G;

      // 画布背景：黑 / 白切换
      const darkBg = ref(false);
      function toggleDarkBg() { darkBg.value = !darkBg.value; scheduleDraw(); }


      // ---- 时间轴 / 图层（图层 = 底部轨道）----
      const layerVersion = ref(0); // 眼睛切换驱动图层面板重渲染
      const activeLayerId = ref(project.tracks[0]?.id ?? null);
      const T = useTimeline({ project, time, selected, selectedId, engineGetter, scheduleDraw, setTime, clipEndOf, pxPerSec, tlMode });
      // 任何入口选中片段（时间轴/资源库/画布/轨道头），左侧图层都跟随高亮
      watch(selectedId, (id) => {
        const c = project.clips.find((x) => x.id === id);
        if (c) activeLayerId.value = c.trackId;
      });
      function selectLayer(id) {
        activeLayerId.value = id;
        P.selectTrack(id); // 选中该图层第一个片段
      }
      const layers = computed(() => project.tracks);
      const layerVisible = (id) => { layerVersion.value; return engine?.isLayerVisible ? engine.isLayerVisible(id) : true; };
      function toggleLayerVisible(id) {
        const vis = engine?.isLayerVisible ? !engine.isLayerVisible(id) : false;
        engine?.setLayerVisible(id, vis);
        layerVersion.value++;
        scheduleDraw();
      }
      const layerClipCount = (id) => project.clips.filter((c) => c.trackId === id).length;
      const LR = useLayerRename(project, scheduleDraw);

      // ---- 图层拖拽排序（vue-draggable-plus）----
      const dragging = ref(false);
      function onDragStart() { dragging.value = true; }
      function onDragEnd() { Vue.nextTick(() => { dragging.value = false; scheduleDraw(); }); }
      function onReorder(newList) {
        // 拖拽期间 DOM 由 Sortable 管，结束后一次性回写顺序（动画结束后才触发）
        project.tracks = [...newList];
        scheduleDraw();
      }

      // 删除图层前先取消重命名态
      const origRemoveTrack = P.removeTrack;
      const removeTrack = (id) => { LR.cancelRename(); origRemoveTrack(id); };

      // ---- 文件 ----
      function applyProject(data) {
        stop();
        P.replaceAll(data);
        time.value = 0;
        resetEngine();
        H.reset(data);
        scheduleDraw();
      }
      function loadExample(kind) {
        applyProject(kind === "sword" ? swordComboProject() : iceLanceProject());
        const c = project.clips.find((x) => x.type === "fx");
        if (c) selectedId.value = c.id;
        notify?.info(kind === "sword" ? "已载入：三连斩" : "已载入：冰标枪");
      }
      const F = useFiles({ project, applyProject, notify });

      // ---- 画布拖入特效 ----
      function stageWorldPoint(e) { return G.canvasPoint(e); }
      function onStageDrop(e) {
        e.currentTarget.classList.remove("drag-over");
        const fxId = e.dataTransfer.getData("text/fx-id") || e.dataTransfer.getData("text/plain");
        if (!fxId) return;
        const cv = canvasEl.value;
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const p = G.canvasPoint(e);
        P.dropFxOnStage(fxId, p.x, p.y);
      }
      function onStageDragOver(e) { e.dataTransfer.dropEffect = "copy"; e.currentTarget.classList.add("drag-over"); }
      function onStageDragLeave(e) { e.currentTarget.classList.remove("drag-over"); }
      // 资源库卡片拖拽（原模板引用了 onLibDrop 但从未实现；这里补上：拖到画布外落在资源面板时忽略）
      function onLibDrop(e) { /* 资源面板内不做落点处理；拖到画布走 stage 的 drop */ }

      // ---- 画布视图方法 ----
      const { autoFit, zoomBy } = CV;
      const focusSelection = () => CV.focusSelection(() => G.selBox());

      // ---- 键盘 ----
      function onKey(e) {
        const tag = document.activeElement?.tagName || "";
        if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          if (e.shiftKey) H.redo(); else H.undo();
        }
        else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
          e.preventDefault();
          H.redo();
        }
        else if (e.key === "0" || e.key === "r" || e.key === "R") { autoFit(); }
        else if (e.key === "f" || e.key === "F") { focusSelection(); }
        else if (e.key === "q" || e.key === "Q") { toggleHand(); }
        else if (e.key === "w" || e.key === "W") { if (!handMode.value) toggleBox(); }
        else if (e.key === "e" || e.key === "E") { if (!handMode.value) toggleAxes(); }
        else if (e.key === "d" || e.key === "D") { toggleDarkBg(); }
        else if (e.key === "Escape") { selectedId.value = null; G.gizmoHover.value = null; scheduleDraw(); }
        else if (e.key === " ") { e.preventDefault(); togglePlay(); }
        else if (e.key === "Delete" || e.key === "Backspace") { P.removeSelected(); }
        else if (e.key === "ArrowLeft") { setTime(time.value - 1 / project.fps); }
        else if (e.key === "ArrowRight") { setTime(time.value + 1 / project.fps); }
      }

      // ---- splits 控制器 ----
      const SC = useSplitsController(S, { canvasW, stageH, tlH, leftW, rightW });
      const ctrl = SC.initWatchers();

      let ro = null;
      onMounted(async () => {
        // canvas / stage 在子组件模板里，用 DOM 查询拿（比跨组件 ref 稳）
        const cvEl = document.querySelector(".stage-canvas");
        const stEl = document.querySelector(".stage-wrap");
        canvasEl.value = cvEl;
        stageEl.value = stEl;
        engine = createEngine(cvEl);
        engine.project = project;
        engine.gizmo = (ctx) => G.drawGizmo(ctx);
        CV.setEngine(engine);
        CV.sizeCanvas();
        ro = new ResizeObserver(() => CV.sizeCanvas());
        ro.observe(stEl);
        await nextTick();
        SC.applyLeftWidth(leftW.value, false);
        await nextTick();
        SC.applyRightWidth(rightW.value, false);
        SC.applyTimelineHeight(tlH.value);
        ctrl.markReady();
        window.addEventListener("resize", SC.onWinResize);
        canvasEl.value.addEventListener("wheel", G.onWheel, { passive: false });
        canvasEl.value.addEventListener("pointerdown", G.onPointerDown);
        canvasEl.value.addEventListener("pointermove", G.onPointerMove);
        canvasEl.value.addEventListener("pointerup", G.onPointerUp);
        canvasEl.value.addEventListener("pointercancel", G.onPointerUp);
        window.addEventListener("keydown", onKey);
        await Promise.all(["moves/ice-lance-throw", "arcane/spell-charge", "ice/ice-lance", "ice/snowflake-burst"].map((id) => loadFx(id).catch(() => null)));
        drawNow();
        window.__editor.ready = true;
        window.dispatchEvent(new Event("anim-editor-ready"));
      });
      onBeforeUnmount(() => {
        ro?.disconnect();
        dispose();
        canvasEl.value?.removeEventListener("wheel", G.onWheel);
        canvasEl.value?.removeEventListener("pointerdown", G.onPointerDown);
        canvasEl.value?.removeEventListener("pointermove", G.onPointerMove);
        canvasEl.value?.removeEventListener("pointerup", G.onPointerUp);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", SC.onWinResize);
      });

      // ---- 测试钩子（浏览器自动化用，保持原接口） ----
      window.__editor = {
        get time() { return time.value; },
        set time(v) { setTime(v); },
        project,
        get selected() { return selectedId.value; },
        select: (id) => { selectedId.value = id; },
        step: (dt) => { advance(dt); },
        setTime,
        togglePlay,
        draw: drawNow,
        engine: () => engine,
        ready: false,
        view,
        undo: () => H.undo(),
        redo: () => H.redo(),
        get canUndo() { return canUndo.value; },
        get canRedo() { return canRedo.value; },
        historyDebug: () => ({ canUndo: canUndo.value, canRedo: canRedo.value }),
        historyStackInfo: () => { const s = H.stackInfo ? H.stackInfo() : null; return s; },
        historyCommitNow: () => { try { H.commit(); return { ok: true, canUndo: canUndo.value, canRedo: canRedo.value }; } catch (e) { return { ok: false, err: e.message + '|' + (e.stack||'').slice(0,200) }; } },
      };
      window.__view = view;
      window.__layout = {
        get leftW() { return leftW.value; },
        get rightW() { return rightW.value; },
        get canvasW() { return canvasW.value; },
        get stageH() { return stageH.value; },
        get tlH() { return tlH.value; },
        setRight: (v) => { SC.applyRightWidth(v, true); },
        setLeft: (v) => { SC.applyLeftWidth(v, true); },
        setTimeline: (v) => { SC.applyTimelineHeight(v); },
      };

      // ---- 模板上下文（reactive 包装让子组件里的 ref 正确解包） ----
      const ctx = Vue.reactive({
        project, time, playing, selectedId, selected, sortedClips, trackOptions,
        pxPerSec, viewScale, tlMode, tlModeLabel: T.tlModeLabel,
        scrollLeft: T.scrollLeft, scrollTop: T.scrollTop,
        totalW: T.totalW, totalH: T.totalH, totalFrames: T.totalFrames, frameNo: T.frameNo,
        ticks: T.ticks, gridStyle: T.gridStyle, clipCell: T.clipCell,
        ROW_H, laneHeight: T.laneHeight, rowCount: T.rowCount, packed: T.packed, hitMarks: T.hitMarks,
        dragId: T.dragId, framesOf: T.framesOf,
        setTlMode: T.setTlMode, onTlScroll: T.onTlScroll, onTlWheel: T.onTlWheel,
        onZoomInput: T.onZoomInput, onRulerDown: T.onRulerDown, onLaneDown: T.onLaneDown,
        stepFrame: T.stepFrame, onClipDown: T.onClipDown, trackActive: T.trackActive, trackIcon: T.trackIcon, dragGhost: T.dragGhost,
        clipEnd: (c) => clipEndOf(c),
        typeIcon, labelOf, skinColor, actLabel, actShort,
        weaponShort: (c) => (c?.weapon ? (WEAPON_LABELS[c.weapon] || c.weapon) : "跟随脚本"),
        fxShort: (c) => (c?.fxId ? c.fxId : ""),
        rightTab: R.rightTab, libCat: R.libCat, libGroups: R.libGroups, libCards: R.libCards, libCount: R.libCount,
        layers, activeLayerId, selectLayer,
        layerVisible, toggleLayerVisible, layerClipCount,
        renamingId: LR.renamingId, renameText: LR.renameText, startRename: LR.startRename, commitRename: LR.commitRename, cancelRename: LR.cancelRename,
        dragging, onDragStart, onDragEnd, onReorder,
        leftW, rightW, canvasW, stageH,
        moveCards: R.moveCards, weaponCards: R.weaponCards, fxCards: R.fxCards,
        paletteCards: R.paletteCards, skinCards: R.skinCards, bindOptions: R.bindOptions,
        ...SEL,
        selectClip: P.selectClip, selectTrack: P.selectTrack,
        addClip: P.addClip, addTrack: P.addTrack, removeTrack,
        removeSelected: P.removeSelected, duplicate: P.duplicate,
        showBox, showAxes, handMode, toggleHand, toggleBox, toggleAxes,
        darkBg, toggleDarkBg,
        play, stop, togglePlay, setTime,
        canUndo, canRedo, undo: () => H.undo(), redo: () => H.redo(),
        save: F.save, load: F.load, exportJson: F.exportJson, loadExample,
        autoFit, zoomBy, focusSelection,
        redraw: scheduleDraw,
        actionInfo: SEL.actionInfo,
        onStageDragOver, onStageDrop, onStageDragLeave, onLibDrop,
      });

      return { ctx, mainSplit: S.mainSplit, innerSplit: S.innerSplit, colSplit: S.colSplit };
    },
    template: `
<div class="app-shell">
  <header class="topbar">
    <span class="material-symbols-outlined">animation</span>
    <h1 class="brand">ANIM-FX 动作编排</h1>
    <span class="topbar-sep"></span>
    <kit-button size="sm" variant="text" icon="icecream" @click="ctx.loadExample('ice')">冰标枪</kit-button>
    <kit-button size="sm" variant="text" icon="swords" @click="ctx.loadExample('sword')">三连斩</kit-button>
    <span class="flex-1"></span>
    <kit-button size="sm" variant="outlined" icon="save" @click="ctx.save">保存</kit-button>
    <kit-button size="sm" variant="outlined" icon="upload_file" @click="ctx.load">载入</kit-button>
    <kit-button size="sm" icon="download" @click="ctx.exportJson">导出 JSON</kit-button>
  </header>
  <div class="main">
    <kit-split class="main-split" ref="mainSplit" v-model="ctx.leftW" :min-left="200" :min-right="560" :snap-edge="false" storage-key="animEditor.v2.leftW">
      <template #a><layer-panel :ctx="ctx"></layer-panel></template>
      <template #b>
        <kit-split class="inner-split" ref="innerSplit" v-model="ctx.canvasW" :min-left="520" :min-right="200" :snap-edge="false">
          <template #a>
            <div class="center-col">
              <kit-split class="col-split" direction="vertical" ref="colSplit" v-model="ctx.stageH" :min-left="160" :min-right="140" :snap-edge="false">
                <template #a><canvas-stage :ctx="ctx"></canvas-stage></template>
                <template #b><timeline-panel :ctx="ctx"></timeline-panel></template>
              </kit-split>
            </div>
          </template>
          <template #b><props-panel :ctx="ctx"></props-panel></template>
        </kit-split>
      </template>
    </kit-split>
  </div>
</div>
    `,
  });
  app.use(window.UIKit);
  app.component("PickCards", PickCards);
  app.component("FxLibrary", FxLibrary);
  app.component("PickSeg", PickSeg);
  app.component("PickSwatch", PickSwatch);
  app.component("CanvasStage", CanvasStage);
  app.component("TimelinePanel", TimelinePanel);
  app.component("PropsPanel", PropsPanel);
  app.component("ClipLibrary", ClipLibrary);
  app.component("LayerPanel", LayerPanel);
  app.component("VueDraggable", window.VueDraggablePlus.VueDraggable);
  app.directive("focus", vFocus);
  return app.mount("#app");
}
