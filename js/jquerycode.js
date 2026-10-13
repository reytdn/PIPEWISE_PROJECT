$(document).ready(function(){
    $("#myButton").click(function(){
        alert("A button is clicked!");
        $("p").hide();
        $("#academic_program").hide();
    });

    $("#hideHeaders").click(function(){
        $("h1, h2, h3").hide();
        $("#showHeaders").prop("disabled", false);
        $(this).prop("disabled", true);
    });

    $("#showHeaders").click(function(){
        // $("h1, h2, h3").show();
        $(":header").show();
        $("#hideHeaders").prop("disabled", false);
        $(this).prop("disabled", true);
    });

    $("#changefontsettings").click(function(){
        $(".details")
            .css("font-size", "20px") 
            .css("color", "blue");   
    });   
    
    $("#changefontsettings").hover(
        function(){ // mouse enter
            $(this).css({
                "transform": "scale(1.2)",  // lets you visually change an element without actually changing its layout space
                "transition": "transform 0.3s ease"  // controls how smoothly a change happens
            });
        },
        function(){ // mouse leave
            $(this).css({
                "transform": "scale(1)",
                "transition": "transform 0.3s ease"
            });
        }
    );    

    $("#getvalue").click(function(){
        alert("Value: " + $("#userinput").val());
    });

    $("#clearvalue").click(function(){
        $("#userinput").val('');
    });

    // Add two numbers
    $("#addNumbers").click(function(){
        let num1 = parseFloat($("#num1").val()) || 0;
        let num2 = parseFloat($("#num2").val()) || 0;
        let sum = num1 + num2;

        $("#sumResult").val(sum); // Place result in input box
    });  

    // IF example
    $("#checkIf").click(function(){
        let num = parseFloat($("#checkNumber").val()) || 0;
        if(num > 0){
            $("#decisionResult").val("The number is positive");
        }
    });

    // IF ELSE example
    $("#checkIfElse").click(function(){
        let num = parseFloat($("#checkNumber").val()) || 0;
        if(num % 2 === 0){
            $("#decisionResult").val("Even number");
        } else {
            $("#decisionResult").val("Odd number");
        }
    });

    // IF ELSE IF example
    $("#checkIfElseIf").click(function(){
        let num = parseFloat($("#checkNumber").val()) || 0;
        if(num > 0){
            $("#decisionResult").val("Positive number");
        } else if(num < 0){
            $("#decisionResult").val("Negative number");
        } else {
            $("#decisionResult").val("Zero");
        }
    });    
    
    // For Loop Simulation
    $("#runForLoop").click(function() {
        let result = "";
        for (let i = 1; i <= 5; i++) {
            result += i + " ";
        }
        $("#forLoopResult").val(result.trim());
    });

    // While Loop Simulation
    $("#runWhileLoop").click(function() {
        let result = "";
        let i = 5;
        while (i >= 1) {
            result += i + " ";
            i--;
        }
        $("#whileLoopResult").val(result.trim());
    });   
    
    // Show Array
    $("#showArray").click(function(){
        let names = $("#namesInput").val().split(",");  // split string into array
        $("#arrayResult").val(names.join(" | "));       // display array with separators
    });

    // Add Name to Array
    $("#addName").click(function(){
        let names = $("#namesInput").val().split(",");
        let newName = prompt("Enter a new name:");
        if(newName){
            names.push(newName); // add to array
            $("#namesInput").val(names.join(","));      // update input value
            $("#arrayResult").val(names.join(" | "));   // display updated array
        }
    });    

    let totalPages = 5;
    let currentPage = 1;

    $("#firstPage").click(function() {
        currentPage = 1;
        $("#currentPage").val(currentPage);
        
        $("#firstPage").prop("disabled", true);
        $("#prevPage").prop("disabled", true);
        $("#nextPage").prop("disabled", false);
        $("#lastPage").prop("disabled", false);
    });

    $("#lastPage").click(function() {
        currentPage = totalPages;
        $("#currentPage").val(currentPage);
        
        $("#nextPage").prop("disabled", true);
        $("#lastPage").prop("disabled", true);
        $("#firstPage").prop("disabled", false);
        $("#prevPage").prop("disabled", false);
    });

    $("#prevPage").click(function() {
        currentPage = (currentPage > 1) ? currentPage - 1 : totalPages;
        $("#currentPage").val(currentPage);
        
        if (currentPage === 1) {
            $("#firstPage").prop("disabled", true);
            $("#prevPage").prop("disabled", true);
            $("#nextPage").prop("disabled", false);
            $("#lastPage").prop("disabled", false);
        } else if (currentPage === totalPages) {
            $("#nextPage").prop("disabled", true);
            $("#lastPage").prop("disabled", true);
            $("#firstPage").prop("disabled", false);
            $("#prevPage").prop("disabled", false);
        } else {
            $("#firstPage").prop("disabled", false);
            $("#prevPage").prop("disabled", false);
            $("#nextPage").prop("disabled", false);
            $("#lastPage").prop("disabled", false);
        }
    });

    $("#nextPage").click(function() {
        currentPage = (currentPage < totalPages) ? currentPage + 1 : 1;
        $("#currentPage").val(currentPage);

        if (currentPage === totalPages) {
            $("#nextPage").prop("disabled", true);
            $("#lastPage").prop("disabled", true);
            $("#firstPage").prop("disabled", false);
            $("#prevPage").prop("disabled", false);
        } else if (currentPage === 1) {
            $("#firstPage").prop("disabled", true);
            $("#prevPage").prop("disabled", true);
            $("#nextPage").prop("disabled", false);
            $("#lastPage").prop("disabled", false);
        } else {
            $("#firstPage").prop("disabled", false);
            $("#prevPage").prop("disabled", false);
            $("#nextPage").prop("disabled", false);
            $("#lastPage").prop("disabled", false);
        }
    });

    // Set initial state
    $("#currentPage").val(currentPage);
    $("#firstPage").prop("disabled", true);
    $("#prevPage").prop("disabled", true);

    // ---------------------------------------------
        // Start on Page 1
    $("#pageSelector").val("1");
    $("#firstBtn, #prevBtn").prop("disabled", true);
    $("#nextBtn, #lastBtn").prop("disabled", false);

    $("#firstBtn").click(function () {
        $("#pageSelector").val("1");
        $("#firstBtn, #prevBtn").prop("disabled", true);
        $("#nextBtn, #lastBtn").prop("disabled", false);
    });

    $("#lastBtn").click(function () {
        $("#pageSelector").val("5");
        $("#nextBtn, #lastBtn").prop("disabled", true);
        $("#firstBtn, #prevBtn").prop("disabled", false);
    });

    $("#prevBtn").click(function () {
        let current = parseInt($("#pageSelector").val());
        if (current > 1) {
            current -= 1;
            $("#pageSelector").val(current);
        }

        $("#firstBtn, #prevBtn").prop("disabled", current === 1);
        $("#nextBtn, #lastBtn").prop("disabled", false);
    });

    $("#nextBtn").click(function () {
        let current = parseInt($("#pageSelector").val());
        if (current < 5) {
            current += 1;
            $("#pageSelector").val(current);
        }

        $("#nextBtn, #lastBtn").prop("disabled", current === 5);
        $("#firstBtn, #prevBtn").prop("disabled", false);
    });

    $("#pageSelector").change(function () {
        let current = parseInt($(this).val());

        $("#firstBtn, #prevBtn").prop("disabled", current === 1);
        $("#nextBtn, #lastBtn").prop("disabled", current === 5);
    });
});