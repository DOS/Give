# Design Principles - Give Crowdfunding Platform

## 🎯 **Core Design Philosophy**

### **Minimalism First**

- **Clean & Simple**: Tránh quá nhiều buttons hay elements phức tạp
- **Less is More**: Mỗi trang chỉ focus vào 1-2 actions chính
- **White Space**: Sử dụng nhiều khoảng trắng để tạo cảm giác thoáng đãng
- **Minimal Rounded Corners**: ⚠️ **QUAN TRỌNG** - KHÔNG bo góc quá nhiều, chỉ dùng `rounded` hoặc `rounded-md`, tránh `rounded-lg`, `rounded-xl`, `rounded-full`

### **User Experience Priority**

- **Intuitive Navigation**: User phải hiểu ngay cách sử dụng mà không cần hướng dẫn
- **Clear Hierarchy**: Information architecture rõ ràng, dễ scan
- **Fast Loading**: Performance luôn được ưu tiên

## 🎨 **Visual Design Guidelines**

### **Border Radius Rules** ⚠️ **QUAN TRỌNG**

- **Buttons**: `rounded` (4px) - KHÔNG dùng `rounded-lg` hay `rounded-full`
- **Cards**: `rounded-md` (6px) - Vừa đủ để tạo softness
- **Input fields**: `rounded-md` (6px) - Consistent với cards
- **Images**: `rounded` (4px) - Subtle corners
- **Containers**: `rounded-md` (6px) maximum
- **TUYỆT ĐỐI TRÁNH**: `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-full`

### **Color Palette**

- **Primary**: Green (GoFundMe-inspired) - cho main actions
  - `green-600` (#059669) - Primary buttons
  - `green-700` (#047857) - Hover states
  - `green-50` (#f0fdf4) - Background tints
- **Secondary**: Light Orange - cho accents và highlights
  - `orange-100` (#fed7aa) - Subtle accents
  - `orange-200` (#fecaca) - Highlights
- **Neutral**: Grays và whites - cho text và backgrounds
  - `gray-50` (#f9fafb) - Light backgrounds
  - `gray-900` (#111827) - Primary text
  - `gray-700` (#374151) - Secondary text

### **Typography**

- **Font Family**: Roboto (clean, readable)
- **Hierarchy**: Clear distinction giữa headings và body text
- **Line Height**: Generous spacing cho readability
- **Font Weights**:
  - Regular (400) cho body text
  - Medium (500) cho emphasis
  - Bold (700) cho headings

### **Spacing & Layout**

- **Consistent Grid**: 8px base unit
- **Generous Padding**: Không cramped, nhiều breathing room
- **Logical Grouping**: Related elements gần nhau
- **Clear Sections**: Distinct separation giữa các content blocks

## 🚫 **What to AVOID**

### **Over-designed Elements**

- ❌ Quá nhiều buttons trên một trang
- ❌ Complex animations hay transitions
- ❌ Gradient overuse
- ❌ Too many colors trong một view
- ❌ **Rounded corners quá nhiều** (rounded-lg, rounded-xl, rounded-full)

### **Cluttered Interface**

- ❌ Information overload
- ❌ Too many navigation options
- ❌ Competing call-to-actions
- ❌ Inconsistent spacing

## ✅ **Best Practices**

### **Navigation**

- **Simple Menu Structure**: Discover, Start Campaign, My Campaigns
- **Search-Centric**: Prominent search bar (IndieGogo/Kickstarter style)
- **Clear CTAs**: "Sign in" và "Start a campaign" prominent nhưng không overwhelming

### **Content Layout**

- **Hero Section**: Clear value proposition, single primary CTA
- **Featured Projects**: Grid layout, clean cards với minimal styling
- **Footer**: Complete sitemap như Radiant template với 4 sections:
  - Company (About, Careers, Press, News)
  - Resources (Blog, Newsletter, Events, Help center)
  - Use cases (Startups, Enterprise, Government, SaaS)
  - Legal (Terms, Privacy, Cookies)

### **Interactive Elements**

- **Buttons**: Subtle shadows, smooth hover transitions
- **Forms**: Clean inputs với clear labels
- **Cards**: Minimal elevation, focus on content

## 📱 **Responsive Design**

- **Mobile First**: Design cho mobile trước
- **Touch Friendly**: Adequate tap targets
- **Readable Text**: Appropriate font sizes across devices
- **Simplified Navigation**: Hamburger menu cho mobile

## 🎯 **Inspiration Sources**

- **GoFundMe**: Color scheme và overall feel
- **IndieGogo/Kickstarter**: Search bar placement và functionality
- **Radiant Template**: Footer structure và overall layout principles
- **Minimal Design**: Clean, uncluttered interfaces

## 📝 **Implementation Notes**

- **Consistent Components**: Reuse design patterns
- **Performance**: Optimize images và assets
- **Accessibility**: Proper contrast ratios và keyboard navigation
- **Testing**: Regular usability testing với real users

---

**Remember**: Đơn giản luôn tốt hơn phức tạp. Khi doubt, chọn option ít elements hơn và ít rounded corners hơn.

## 🎯 **Platform-Specific Guidelines**

### **Crowdfunding Focus**

- **Trust Signals**: Security badges, testimonials
- **Progress Indicators**: Clear funding progress
- **Social Sharing**: Easy sharing options
- **Creator Profiles**: Build trust với creator information

### **Mobile Experience**

- **Touch Targets**: Minimum 44px for buttons
- **Thumb Navigation**: Important actions within thumb reach
- **Readable Text**: Minimum 16px font size
- **Fast Forms**: Minimal typing required

## 📊 **Success Metrics**

### **Design Success**

- **User Feedback**: "Clean", "simple", "easy to use"
- **Task Completion**: High success rates for key actions
- **Time on Task**: Quick completion of primary flows
- **Return Users**: High retention rates

### **Technical Success**

- **Page Speed**: < 3 seconds load time
- **Mobile Score**: 90+ on Google PageSpeed
- **Accessibility**: WCAG 2.1 AA compliance
- **Cross-browser**: Consistent experience across browsers

---

## 📝 **Implementation Notes**

### **Development Workflow**

1. **Design Review**: Check against these principles before coding
2. **Component Library**: Reuse existing components
3. **Testing**: Test on multiple devices và browsers
4. **Performance**: Monitor load times và user experience

### **Regular Reviews**

- **Weekly**: Review new components against principles
- **Monthly**: User feedback analysis
- **Quarterly**: Update principles based on learnings

---

_Last updated: June 15, 2025_
_Remember: Simple, clean, minimal rounded corners, user-focused design_
