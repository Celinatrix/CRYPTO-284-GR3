/* =============================================================================
   animations.js
   ============================================================================
   Hiệu ứng chuyển động phong cách Awwwards — dùng GSAP 3 + ScrollTrigger +
   SplitText + Lenis (nạp qua CDN trong index.html, trước file này).

   AN TOÀN: toàn bộ file bọc trong 1 khối kiểm tra sớm — nếu GSAP/CDN không
   nạp được vì bất kỳ lý do gì (mạng chậm, bị chặn...), hàm return ngay lập
   tức, không set bất kỳ trạng thái ẩn nào lên trang. Vì mọi phần tử trong
   index.html/animations.css đã có sẵn trạng thái "hiển thị đầy đủ, đúng vị
   trí cuối cùng" làm mặc định, trang vẫn dùng được bình thường, chỉ là không
   có hiệu ứng.

   File độc lập — gỡ file này + animations.css + 4 dòng <script src> (gsap,
   ScrollTrigger, SplitText, lenis) trong index.html là gỡ sạch, không ảnh
   hưởng gì tới phần còn lại của trang (hệ thống i18n/theme/.reveal cũ nằm
   trong <script> riêng của index.html, độc lập với file này).
   ============================================================================ */
(function () {
  'use strict';

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    // GSAP/ScrollTrigger không nạp được — ẩn preloader ngay (nếu có) rồi dừng,
    // không chạy bất kỳ hiệu ứng nào. Trang vẫn hiển thị đúng nhờ CSS mặc định.
    var pl = document.getElementById('site-preloader');
    if (pl) pl.style.display = 'none';
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  var hasSplitText = typeof SplitText !== 'undefined';
  if (hasSplitText) gsap.registerPlugin(SplitText);

  var prefersReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Đợi DOMContentLoaded rồi mới chạy: <script> áp dụng bản dịch (i18n) trong
     index.html cũng lắng nghe DOMContentLoaded và được đăng ký TRƯỚC file này
     (nằm phía trên trong HTML), nên nó luôn chạy trước — đảm bảo SplitText ở
     dưới đây tách chữ trên nội dung ĐÃ dịch xong, không bị applyTranslations()
     ghi đè textContent (xoá mất các span đã tách) ngay sau khi vừa tách. */
  function start() {
    /* =========================================================================
       A) LENIS — smooth scroll toàn trang, đồng bộ với ScrollTrigger.
       (Hiệu ứng #1 trong yêu cầu)
       ========================================================================= */
    var lenis = null;
    if (!prefersReduce && typeof Lenis !== 'undefined') {
      lenis = new Lenis({ duration: 1.1, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    /* =========================================================================
       B) PRELOADER — dùng logo/crest có sẵn, phóng to nhẹ rồi ẩn đi.
       Gắn vào: #site-preloader (đầu <body>, xem index.html)
       (Hiệu ứng #2 — thay "ảnh nhỏ phóng to thành hero" vì trang không có ảnh
       hero lớn; dùng chính logo hiện có cho đúng tinh thần hiệu ứng.)
       ========================================================================= */
    var preloader = document.getElementById('site-preloader');
    var preloaderCrest = preloader ? preloader.querySelector('.preloader-crest') : null;
    var preloaderPercent = preloader ? preloader.querySelector('.preloader-percent') : null;
    var preloaderBarFill = preloader ? preloader.querySelector('.preloader-bar-fill') : null;

    function runHero() { /* định nghĩa ở mục C, gọi lại sau khi preloader xong */ }

    if (preloader) {
      if (prefersReduce) {
        gsap.set(preloader, { display: 'none' });
      } else {
        var tlPre = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete: function () {
            gsap.set(preloader, { display: 'none' });
            runHero();
          }
        });
        if (preloaderCrest) {
          tlPre.fromTo(preloaderCrest, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5 });
        }
        // Số % + thanh chạy đếm thật theo tiến độ của chính timeline này
        // (0 -> 100 khớp lúc preloader biến mất) — không phải số giả định.
        if (preloaderPercent || preloaderBarFill) {
          var pctProxy = { v: 0 };
          tlPre.to(pctProxy, {
            v: 100,
            duration: 0.85,
            ease: 'power1.inOut',
            onUpdate: function () {
              var v = Math.round(pctProxy.v);
              if (preloaderPercent) preloaderPercent.textContent = v + '%';
              if (preloaderBarFill) preloaderBarFill.style.width = v + '%';
            }
          }, 0);
        }
        tlPre.to(preloader, { opacity: 0, duration: 0.5 }, '+=0.35');
      }
    }

    /* =========================================================================
       C) HERO — tiêu đề trượt lên từng ký tự (stagger), phụ đề/nhãn/nút fade-up
       nối tiếp; khi cuộn xuống, khối hero co nhẹ + bo góc, chữ parallax chậm
       hơn nền.
       Gắn vào: #home (.hero, .hero-badge, .hero-title, .hero-lead, .hero-facts,
       .hero-cta-wrap)
       (Hiệu ứng #3)
       ========================================================================= */
    var hero = document.getElementById('home');
    var heroTitle = hero ? hero.querySelector('.hero-title') : null;
    var heroInner = hero ? hero.querySelector('.hero-inner') : null;

    // Dùng chung cho mục L (đổi ngôn ngữ sau khi tải xong) — khai báo sớm để
    // gọi được cho hero-title ngay sau khi SplitText tách xong bên dưới, và
    // cho about-lead/section-title ở mục L (những phần tử đó tách đồng bộ,
    // xong trước khi mục L chạy nên không cần gọi thủ công ở đó).
    function watchI18nFlash(el) {
      if (!el || prefersReduce || typeof MutationObserver === 'undefined') return;
      var mo = new MutationObserver(function () {
        gsap.fromTo(el, { opacity: 0.25 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }

    runHero = function () {
      if (!hero) return;

      if (prefersReduce) return; // giữ nguyên trạng thái tĩnh, đã hiển thị đúng sẵn từ CSS gốc

      var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (heroTitle && hasSplitText) {
        var titleSplit = new SplitText(heroTitle, { type: 'chars' });
        gsap.set(titleSplit.chars, { yPercent: 120, opacity: 0 });
        tl.to(titleSplit.chars, { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.018 }, 0.1);
      } else if (heroTitle) {
        gsap.set(heroTitle, { opacity: 0, y: 24 });
        tl.to(heroTitle, { opacity: 1, y: 0, duration: 0.9 }, 0.1);
      }
      // Gọi SAU khi SplitText đã tách xong (đồng bộ ở trên) — nếu gọi ở mục L
      // như about-lead/section-title thì sẽ bắt nhầm chính thao tác tách chữ
      // này làm "đổi ngôn ngữ", chớp sai lúc hero vừa mới chạy xong.
      watchI18nFlash(heroTitle);

      ['.hero-badge', '.hero-lead', '.hero-facts', '.hero-cta-wrap'].forEach(function (sel, i) {
        var el = hero.querySelector(sel);
        if (!el) return;
        gsap.set(el, { opacity: 0, y: 20 });
        tl.to(el, { opacity: 1, y: 0, duration: 0.8 }, 0.35 + i * 0.12);
      });
    };
    if (!preloader) runHero(); // không có preloader trên trang này → chạy luôn

    // Cuộn xuống: hero co nhẹ + bo góc; nội dung chữ trôi chậm hơn (parallax)
    if (hero && !prefersReduce) {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
        gsap.to(hero, {
          scale: 0.94,
          borderRadius: '32px',
          ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
        });
        if (heroInner) {
          gsap.to(heroInner, {
            yPercent: -6,
            ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
          });
        }
      });
    }

    /* =========================================================================
       D) ĐOẠN GIỚI THIỆU LỚN — từng từ mờ (0.2) → rõ (1) khi cuộn tới (scrub,
       chỉ đổi opacity, không đổi màu).
       Gắn vào: #about .about-lead
       (Hiệu ứng #4)
       ========================================================================= */
    var aboutLead = document.querySelector('.about-lead');
    if (aboutLead && hasSplitText && !prefersReduce) {
      var leadSplit = new SplitText(aboutLead, { type: 'words', wordsClass: 'split-word' });
      gsap.set(leadSplit.words, { opacity: 0.2 });
      gsap.to(leadSplit.words, {
        opacity: 1,
        stagger: 0.04,
        ease: 'none',
        scrollTrigger: { trigger: aboutLead, start: 'top 85%', end: 'bottom 55%', scrub: true }
      });
    }

    /* =========================================================================
       E) TIÊU ĐỀ TỪNG SECTION — xuất hiện từng từ với blur(10px) → rõ.
       Gắn vào: mọi .section-title (About, Agenda, Speakers, Penalty Matrix,
       Regulatory Library, Registration, FAQ) — trừ hero-title đã có hiệu ứng
       riêng ở mục C.
       (Hiệu ứng #14)
       ========================================================================= */
    if (hasSplitText && !prefersReduce) {
      document.querySelectorAll('.section-title').forEach(function (titleEl) {
        var wordSplit = new SplitText(titleEl, { type: 'words' });
        gsap.set(wordSplit.words, { opacity: 0, filter: 'blur(10px)' });
        gsap.to(wordSplit.words, {
          opacity: 1,
          filter: 'blur(0px)',
          duration: 0.9,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: { trigger: titleEl, start: 'top 88%', toggleActions: 'play none none none' }
        });
      });
    }

    /* =========================================================================
       F) ẢNH/THẺ HÀNG LOẠT + SỐ LIỆU ĐẾM LÊN — đã có sẵn hệ thống .reveal /
       data-count-target hoạt động tốt trong <script> chính của index.html
       (IntersectionObserver thuần) cho: about-points, agenda-item, speaker,
       doc, faq-item, contact-item, và 4 ô số liệu thống kê. KHÔNG lặp lại
       bằng GSAP ở đây để tránh 2 hệ thống animate cùng 1 phần tử.
       (Hiệu ứng #5 và #6 — coi như đã đáp ứng bởi hệ thống có sẵn.)
       ========================================================================= */

    /* =========================================================================
       G) AGENDA — thanh tiến trình dọc chạy theo scroll (chỉ desktop; mobile
       giữ hiệu ứng fade-up đơn giản có sẵn ở mục F).
       Gắn vào: #agenda .agenda-list (+ .agenda-progress-track/-fill, thêm
       bằng JS bên dưới — không đổi bố cục các item bên trong)
       (Hiệu ứng #10 — bản rút gọn không pin, để tránh lệch bố cục khi đổi
       ngôn ngữ VI/EN/中文 làm chiều cao từng bước khác nhau đáng kể; vẫn giữ
       đúng phần "thanh progress dọc chạy theo scroll" của yêu cầu.)
       ========================================================================= */
    var agendaList = document.querySelector('#agenda .agenda-list');
    if (agendaList && !prefersReduce) {
      var track = document.createElement('div');
      track.className = 'agenda-progress-track';
      var fill = document.createElement('div');
      fill.className = 'agenda-progress-fill';
      track.appendChild(fill);

      // Chấm mốc theo từng agenda-item — sáng dần (đổi --slate-200 sang
      // --gold, xem animations.css) khi thanh fill phía trên chạy qua vị
      // trí của item đó. Vị trí tính theo offsetTop thật của từng item nên
      // luôn đúng dù đổi ngôn ngữ làm chiều cao item khác nhau.
      var agendaItems = agendaList.querySelectorAll(':scope > .agenda-item');
      var dots = [];
      agendaItems.forEach(function (item) {
        var dot = document.createElement('div');
        dot.className = 'agenda-progress-dot';
        track.appendChild(dot);
        dots.push({ el: dot, item: item });
      });

      agendaList.appendChild(track);

      function layoutDots() {
        var trackH = track.clientHeight;
        if (!trackH) return;
        dots.forEach(function (d) {
          var ratio = (d.item.offsetTop + d.item.offsetHeight / 2 - 6) / trackH;
          ratio = Math.max(0, Math.min(1, ratio));
          d.ratio = ratio;
          d.el.style.top = (ratio * 100) + '%';
        });
      }

      gsap.matchMedia().add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
        document.documentElement.classList.add('agenda-timeline-on');
        layoutDots();
        window.addEventListener('resize', layoutDots);

        gsap.to(fill, {
          height: '100%',
          ease: 'none',
          scrollTrigger: {
            trigger: agendaList,
            start: 'top 70%',
            end: 'bottom 60%',
            scrub: true,
            onUpdate: function (self) {
              dots.forEach(function (d) {
                d.el.classList.toggle('is-lit', self.progress >= (d.ratio || 0));
              });
            }
          }
        });
        return function () {
          document.documentElement.classList.remove('agenda-timeline-on');
          window.removeEventListener('resize', layoutDots);
        };
      });
    }

    /* =========================================================================
       H) FOOTER REVEAL — nội dung trang trượt lên để lộ footer cố định phía
       dưới (chỉ desktop — trên mobile giữ bố cục thường, tránh lỗi vặt do
       thanh địa chỉ trình duyệt di động thay đổi chiều cao khi cuộn).
       Gắn vào: <main id="site-main"> + footer.site-footer
       (Hiệu ứng #13)
       ========================================================================= */
    var siteMain = document.getElementById('site-main');
    var siteFooter = document.querySelector('.site-footer');
    if (siteMain && siteFooter && !prefersReduce) {
      gsap.matchMedia().add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
        function applyOffset() { siteMain.style.marginBottom = siteFooter.offsetHeight + 'px'; }
        applyOffset();
        document.documentElement.classList.add('footer-reveal-on');
        window.addEventListener('resize', applyOffset);
        return function () {
          document.documentElement.classList.remove('footer-reveal-on');
          siteMain.style.marginBottom = '';
          window.removeEventListener('resize', applyOffset);
        };
      });
    }

    /* =========================================================================
       I) FAQ ACCORDION — GSAP animate chiều cao mượt, thay hành vi bật/tắt tức
       thì mặc định của <details>/<summary>.
       Gắn vào: #contact .faq-item
       (Hiệu ứng #16)
       ========================================================================= */
    document.querySelectorAll('.faq-item').forEach(function (item) {
      var summary = item.querySelector('summary');
      var content = item.querySelector('.faq-a');
      if (!summary || !content) return;

      gsap.set(content, { height: 0, overflow: 'hidden' });

      summary.addEventListener('click', function (e) {
        e.preventDefault(); // chặn hành vi bật/tắt tức thì mặc định, GSAP tự animate thay thế
        var opening = !item.open;

        if (opening) {
          item.open = true; // mở DOM trước để đo scrollHeight thật (kể cả khi đang ở ngôn ngữ dài như 中文/Tiếng Việt)
          gsap.fromTo(content, { height: 0 }, {
            height: content.scrollHeight,
            duration: prefersReduce ? 0 : 0.5,
            ease: 'power3.out',
            onComplete: function () { gsap.set(content, { height: 'auto' }); }
          });
        } else {
          gsap.set(content, { height: content.scrollHeight }); // ép về số cụ thể trước khi thu lại (đang có thể là 'auto')
          gsap.to(content, {
            height: 0,
            duration: prefersReduce ? 0 : 0.4,
            ease: 'power3.out',
            onComplete: function () { item.open = false; }
          });
        }
      });
    });

    /* =========================================================================
       J) CUSTOM CURSOR — chấm tròn nhỏ theo chuột có độ trễ, phóng to khi hover
       nút/thẻ/link. Dùng --gold đã có sẵn (đặt trong animations.css). Chỉ bật
       trên thiết bị có chuột thật, tắt hẳn khi cảm ứng hoặc giảm chuyển động.
       (Hiệu ứng #17)
       ========================================================================= */
    if (!prefersReduce) {
      gsap.matchMedia().add('(hover: hover) and (pointer: fine)', function () {
        var cursor = document.createElement('div');
        cursor.id = 'custom-cursor';
        var cursorLabel = document.createElement('span');
        cursorLabel.className = 'cursor-label';
        cursor.appendChild(cursorLabel);
        document.body.appendChild(cursor);
        document.documentElement.classList.add('has-custom-cursor');

        var xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
        var yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });

        function onMove(e) { xTo(e.clientX); yTo(e.clientY); }
        document.addEventListener('mousemove', onMove);

        // Nhãn nhỏ trong cursor cho 2 nhóm mục có hành động rõ ràng: tải tài
        // liệu (a[download]) và đăng ký/gửi form (.btn-gold, .btn-solid-gold).
        // Dùng ký hiệu mũi tên thay vì chữ để không phải thêm bản dịch mới.
        function labelFor(el) {
          if (el.closest('a[download]')) return '↓'; // ↓ tải xuống
          if (el.closest('.btn-gold, .btn-solid-gold')) return '→'; // → đăng ký / gửi
          return '';
        }

        var hoverTargets = document.querySelectorAll('a, button, .card-hover, input, select, textarea');
        function onEnter(e) {
          cursor.classList.add('is-hover');
          var label = labelFor(e.currentTarget);
          if (label) {
            cursorLabel.textContent = label;
            cursor.classList.add('has-label');
          }
        }
        function onLeave() {
          cursor.classList.remove('is-hover', 'has-label');
          cursorLabel.textContent = '';
        }
        hoverTargets.forEach(function (el) {
          el.addEventListener('mouseenter', onEnter);
          el.addEventListener('mouseleave', onLeave);
        });

        return function () {
          document.removeEventListener('mousemove', onMove);
          hoverTargets.forEach(function (el) {
            el.removeEventListener('mouseenter', onEnter);
            el.removeEventListener('mouseleave', onLeave);
          });
          document.documentElement.classList.remove('has-custom-cursor');
          cursor.remove();
        };
      });
    }

    /* =========================================================================
       K) MAGNETIC BUTTON — nút chính (Register/Submit) hơi "hút" theo con trỏ
       trong bán kính gần, thay cho hiệu ứng scale CSS khi hover. Chỉ transform,
       không đổi màu/kích thước thật/layout xung quanh.
       Gắn vào: mọi .btn-gold, .btn-solid-gold — chỉ thiết bị có chuột thật.
       (Nâng cấp thêm ngoài 17 hiệu ứng gốc, theo yêu cầu nâng cấp motion design.)
       ========================================================================= */
    if (!prefersReduce) {
      gsap.matchMedia().add('(hover: hover) and (pointer: fine)', function () {
        var magnets = document.querySelectorAll('.btn-gold, .btn-solid-gold');
        var cleanups = [];

        magnets.forEach(function (btn) {
          var xTo = gsap.quickTo(btn, 'x', { duration: 0.35, ease: 'power3.out' });
          var yTo = gsap.quickTo(btn, 'y', { duration: 0.35, ease: 'power3.out' });
          var scaleTo = gsap.quickTo(btn, 'scale', { duration: 0.35, ease: 'power3.out' });

          function onMove(e) {
            var r = btn.getBoundingClientRect();
            xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
            yTo((e.clientY - (r.top + r.height / 2)) * 0.25);
            scaleTo(1.04);
          }
          function onLeave() {
            gsap.to(btn, {
              x: 0, y: 0, scale: 1, duration: 0.4, ease: 'power3.out',
              onComplete: function () { gsap.set(btn, { clearProps: 'transform' }); }
            });
          }
          btn.addEventListener('mousemove', onMove);
          btn.addEventListener('mouseleave', onLeave);
          cleanups.push(function () {
            btn.removeEventListener('mousemove', onMove);
            btn.removeEventListener('mouseleave', onLeave);
            gsap.set(btn, { clearProps: 'transform' });
          });
        });

        return function () { cleanups.forEach(function (fn) { fn(); }); };
      });
    }

    /* =========================================================================
       L) ĐỔI NGÔN NGỮ SAU KHI TẢI XONG — about-lead/section-title dùng
       SplitText lúc tải trang (đã tách xong đồng bộ ở mục D/E phía trên);
       nếu người dùng đổi VI/EN/中文 sau đó, applyTranslations() (script
       chính) ghi đè textContent, làm chữ đổi tức thì không hiệu ứng. Dùng
       watchI18nFlash() (khai báo ở mục C) để chớp mờ→rõ nhẹ (0.3s, chỉ đổi
       opacity) cho đỡ giật — không tự tách lại chữ (tránh 2 hệ thống tranh
       chấp DOM). hero-title đã tự gọi hàm này riêng ở mục C, sau khi
       SplitText của nó tách xong (bất đồng bộ, sau preloader).
       ========================================================================= */
    watchI18nFlash(aboutLead);
    document.querySelectorAll('.section-title').forEach(watchI18nFlash);

    /* =========================================================================
       BỎ QUA (không có section phù hợp trong trang này — không tự tạo section
       mới theo đúng yêu cầu):
         #7  Danh sách dịch vụ + ảnh đổi theo mục active (pin) — trang không có
             cấu trúc "danh sách + 1 ảnh lớn dùng chung đổi theo mục chọn".
         #8  Section dự án dạng stacking cards — trang không có mục "dự án"
             với nhiều ảnh lớn để chồng thẻ khi cuộn.
         #9  Testimonials — trang không có mục đánh giá/nhận xét khách hàng.
         #11 Ảnh CTA full-width parallax — trang không có mục CTA nền ảnh lớn
             (nút "Register Now" chỉ là nút, không phải khối ảnh nền).
         #15 Ảnh lớn reveal trái→phải + blur→rõ — trang không dùng ảnh chụp/
             minh hoạ lớn nào (toàn bộ icon là SVG nhỏ, biểu đồ là SVG vẽ số
             liệu, không phải "ảnh lớn" theo tinh thần hiệu ứng này).
       ========================================================================= */

    // Cho ScrollTrigger tính lại vị trí sau khi mọi SplitText/height đã dựng xong
    ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    // Phòng trường hợp file này được nạp lại (defer/async) sau khi DOM đã sẵn sàng.
    start();
  }
})();
